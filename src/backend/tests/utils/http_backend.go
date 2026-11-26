package utils

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"
)

type Backend struct {
	base   string
	cookie string
	client *http.Client
}

type APIPhoto struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	UploadedAt time.Time `json:"uploadedAt"`
	TagIDs     []string  `json:"tagIds"`
}

type PhotoPage struct {
	Photos        []APIPhoto `json:"photos"`
	NextPageToken string     `json:"nextPageToken"`
}

func (app Backend) PhotoPage(t *testing.T, path string) PhotoPage {
	t.Helper()

	var page PhotoPage
	Decode(t, app.Request(t, "GET", path, "", 200), &page)
	return page
}

func (app Backend) Photos(t *testing.T, path string) []APIPhoto {
	t.Helper()
	return app.PhotoPage(t, path).Photos
}

func (app Backend) SubmitUpload(t *testing.T, name string, jpegBytes []byte) {
	t.Helper()

	var form struct {
		URL    string            `json:"url"`
		Fields map[string]string `json:"fields"`
	}
	Decode(t, app.Request(t, "POST", "/api/photos",
		fmt.Sprintf(`{"name":%q,"contentType":"image/jpeg","size":%d}`, name, len(jpegBytes)), 201), &form)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for name, value := range form.Fields {
		if err := writer.WriteField(name, value); err != nil {
			t.Fatal(err)
		}
	}
	file, err := writer.CreateFormFile("file", name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(jpegBytes); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequestWithContext(t.Context(), "POST", form.URL, &body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := app.client.Do(req)
	if err != nil {
		t.Fatalf("submit upload: %v", err)
	}
	_ = response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		t.Fatalf("submit upload: %s", response.Status)
	}

}

func (app Backend) WaitForPhotos(t *testing.T, names []string) map[string]APIPhoto {
	t.Helper()

	deadline := time.Now().Add(time.Minute)
	for time.Now().Before(deadline) {
		found := make(map[string]APIPhoto, len(names))
		seenTokens := make(map[string]bool)
		path := "/api/photos"
		for {
			page := app.PhotoPage(t, path)
			for _, photo := range page.Photos {
				if slices.Contains(names, photo.Name) && photo.ID != "" && !photo.UploadedAt.IsZero() {
					found[photo.Name] = photo
				}
			}
			token := page.NextPageToken
			if token == "" {
				break
			}
			if seenTokens[token] {
				t.Fatal("photo pagination repeated a continuation token")
			}
			seenTokens[token] = true
			path = "/api/photos?pageToken=" + url.QueryEscape(token)
		}
		if len(found) == len(names) {
			return found
		}
		time.Sleep(500 * time.Millisecond)
	}
	t.Fatal("the uploaded photos did not appear in the library within one minute")
	return nil
}

func (app Backend) RejectMismatchedState(t *testing.T) {
	t.Helper()

	login := app.Request(t, "GET", "/auth/login", "", 303)
	location, err := login.response.Location()
	if err != nil {
		t.Fatal(err)
	}
	params := location.Query()
	state := params.Get("state")
	if state == "" || params.Get("nonce") == "" || params.Get("code_challenge") == "" || params.Get("code_challenge_method") != "S256" {
		t.Fatal("sign-in redirect is missing state, nonce, or proof key parameters")
	}
	var cookies []string
	for _, cookie := range login.response.Cookies() {
		cookies = append(cookies, cookie.Name+"="+cookie.Value)
	}
	app.cookie = strings.Join(cookies, "; ")
	app.Request(t, "GET", "/auth/callback?code=unused&state="+url.QueryEscape(state+"-wrong"), "", 400)
}

func (app Backend) SignIn(t *testing.T) Backend {
	t.Helper()

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	client := *app.client
	client.CheckRedirect = nil
	client.Jar = jar
	response, err := client.Get(app.base + "/auth/login")
	if err != nil {
		t.Fatal("sign-in did not complete through the configured test identity provider")
	}
	_ = response.Body.Close()
	if response.StatusCode != 200 || response.Request.URL.String() != app.base+"/" {
		t.Fatal("sign-in did not return the owner to the app")
	}
	client.CheckRedirect = app.client.CheckRedirect
	app.client = &client
	return app
}

func (app Backend) CreateTag(t *testing.T, name, parentID string) string {
	t.Helper()

	var tag struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		ParentID string `json:"parentId"`
	}
	Decode(t, app.Request(t, "POST", "/api/tags",
		fmt.Sprintf(`{"name":%q,"parentId":%q}`, name, parentID), 201), &tag)
	if tag.ID == "" || tag.Name != name || tag.ParentID != parentID {
		t.Fatalf("created tag = %+v, want %q with parent %q", tag, name, parentID)
	}
	return tag.ID
}

func (app Backend) Download(t *testing.T, path string) []byte {
	t.Helper()

	response := app.Request(t, "GET", path, "", 307)
	location, err := response.response.Location()
	if err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequestWithContext(t.Context(), "GET", location.String(), nil)
	if err != nil {
		t.Fatal(err)
	}
	result, err := app.client.Do(req)
	if err != nil {
		t.Fatal("could not download the photo")
	}
	defer func() { _ = result.Body.Close() }()
	if result.StatusCode != 200 {
		t.Fatalf("download returned %s", result.Status)
	}
	return read(t, result)
}

type APIResponse struct {
	response *http.Response
	body     []byte
}

func (app Backend) Request(t *testing.T, method, path, body string, status int) APIResponse {
	t.Helper()

	req, err := http.NewRequestWithContext(context.Background(), method, app.base+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", app.base)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if app.cookie != "" {
		req.Header.Set("Cookie", app.cookie)
	}
	response, err := app.client.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer func() { _ = response.Body.Close() }()
	data := read(t, response)
	if response.StatusCode != status {
		t.Fatalf("%s %s returned %d, want %d; body: %s", method, path, response.StatusCode, status, data)
	}
	return APIResponse{response: response, body: data}
}

func read(t *testing.T, response *http.Response) []byte {
	t.Helper()

	body, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func Decode(t *testing.T, response APIResponse, output any) {
	t.Helper()

	if err := json.Unmarshal(response.body, output); err != nil {
		t.Fatalf("decode JSON response: %v", err)
	}
}

func CheckJSON(t *testing.T, response APIResponse, expected string) {
	t.Helper()

	var got any
	Decode(t, response, &got)
	var want any
	if err := json.Unmarshal([]byte(expected), &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("response = %+v, want %s", got, expected)
	}
}

// StartBackend uses an isolated local instance unless a test backend URL is supplied.
func StartBackend(t *testing.T) (owner, visitor Backend) {
	t.Helper()

	base := strings.TrimRight(os.Getenv("PORTFOLIO_TEST_URL"), "/")
	cookie := os.Getenv("PORTFOLIO_TEST_OWNER_COOKIE")
	if base == "" {
		base = localBackend(t)
		cookie = ""
	}

	visitor = newBackend(base, "")
	owner = newBackend(base, cookie)
	if cookie == "" {
		owner = visitor.SignIn(t)
	}
	return owner, visitor
}

func newBackend(base, ownerCookie string) Backend {
	return Backend{
		base:   base,
		cookie: ownerCookie,
		client: &http.Client{
			Timeout: 15 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

func UploadJPEG(t *testing.T, app Backend, name string, width, height int) string {
	t.Helper()

	var data bytes.Buffer
	if err := jpeg.Encode(&data, image.NewRGBA(image.Rect(0, 0, width, height)), nil); err != nil {
		t.Fatal(err)
	}
	app.SubmitUpload(t, name, data.Bytes())
	return app.WaitForPhotos(t, []string{name})[name].ID
}

func (app *Backend) SignOut(t *testing.T) {
	t.Helper()

	if app.cookie != "" {
		jar, err := cookiejar.New(nil)
		if err != nil {
			t.Fatal(err)
		}
		endpoint, err := url.Parse(app.base)
		if err != nil {
			t.Fatal(err)
		}
		headers := http.Header{"Cookie": {app.cookie}}
		jar.SetCookies(endpoint, (&http.Request{Header: headers}).Cookies())
		client := *app.client
		client.Jar = jar
		app.client = &client
		app.cookie = ""
	}
	app.Request(t, "POST", "/auth/logout", "", 303)
}
