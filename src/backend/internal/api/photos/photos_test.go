package photos_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/imkln/portfolio/src/backend/internal/api/photos"
	"github.com/imkln/portfolio/src/backend/internal/api/testutils"
	photostore "github.com/imkln/portfolio/src/backend/internal/shared/photos"
)

const (
	maxPhotoBytes = 64 << 20
	photoPath     = "/api/photos/lake"
	thumbnailPath = photoPath + "/thumbnail"
	originalKey   = "originals/lake.jpg"
	thumbnailKey  = "thumbnails/lake.jpg"
	fileOrigin    = "https://photos.example.test/"
)

func TestOwnerCanListPhotos(t *testing.T) {
	older := photo("older", "ready", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	newer := photo("newer", "ready", time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC))
	fixture := newLibrary(true, older, newer)

	response := testutils.Request(fixture, http.MethodGet, "/api/photos", "")

	page := readPage(t, response)
	if got := page.ids(); !slices.Equal(got, []string{"newer", "older"}) {
		t.Fatalf("photos = %v, want [newer older]", got)
	}
}

func TestOwnerCanLoadMorePhotos(t *testing.T) {
	uploadedAt := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	var items []photoItem
	for i := 1; i <= 25; i++ {
		items = append(items, photo(fmt.Sprintf("photo-%02d", i), "ready", uploadedAt))
	}
	fixture := newLibrary(true, items...)

	first := readPage(t, testutils.Request(fixture, http.MethodGet, "/api/photos", ""))
	if len(first.Photos) != 24 || first.NextPageToken == "" {
		t.Fatalf("first page has %d photos and token %q, want 24 photos and a token", len(first.Photos), first.NextPageToken)
	}

	path := "/api/photos?pageToken=" + url.QueryEscape(first.NextPageToken)
	next := readPage(t, testutils.Request(fixture, http.MethodGet, path, ""))

	var want []string
	for i := 25; i >= 1; i-- {
		want = append(want, fmt.Sprintf("photo-%02d", i))
	}

	if got := append(first.ids(), next.ids()...); !slices.Equal(got, want) {
		t.Fatalf("photos across both pages = %v, want %v", got, want)
	}
	if next.NextPageToken != "" {
		t.Fatalf("last page has token %q, want no token", next.NextPageToken)
	}
}

func TestListHidesUnfinishedPhotos(t *testing.T) {
	uploadedAt := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	fixture := newLibrary(true,
		photo("ready", "ready", uploadedAt),
		photo("uploading", "uploading", uploadedAt),
		photo("processing", "processing", uploadedAt),
	)

	response := testutils.Request(fixture, http.MethodGet, "/api/photos", "")

	page := readPage(t, response)
	if got := page.ids(); !slices.Equal(got, []string{"ready"}) {
		t.Fatalf("photos = %v, want [ready]", got)
	}
}

func TestNonOwnerCannotListPhotos(t *testing.T) {
	fixture := newLibrary(false)

	response := testutils.Request(fixture, http.MethodGet, "/api/photos", "")

	testutils.CheckStatus(t, response, http.StatusUnauthorized)
}

func TestListRejectsInvalidPageToken(t *testing.T) {
	fixture := newLibrary(true)

	response := testutils.Request(fixture, http.MethodGet, "/api/photos?pageToken=invalid!", "")

	testutils.CheckStatus(t, response, http.StatusBadRequest)
}

func TestOwnerCanGetPhoto(t *testing.T) {
	fixture, _ := readyPhoto(true)

	response := testutils.Request(fixture, http.MethodGet, photoPath, "")

	testutils.CheckStatus(t, response, http.StatusTemporaryRedirect)
	if location := response.Header().Get("Location"); location != fileOrigin+originalKey {
		t.Fatalf("redirect = %q, want the original", location)
	}
}

func TestOwnerCanGetThumbnail(t *testing.T) {
	fixture, _ := readyPhoto(true)

	response := testutils.Request(fixture, http.MethodGet, thumbnailPath, "")

	testutils.CheckStatus(t, response, http.StatusTemporaryRedirect)
	if location := response.Header().Get("Location"); location != fileOrigin+thumbnailKey {
		t.Fatalf("redirect = %q, want the thumbnail", location)
	}
}

func TestNonOwnerCannotGetPhoto(t *testing.T) {
	fixture, _ := readyPhoto(false)

	for _, path := range []string{photoPath, thumbnailPath} {
		t.Run(path, func(t *testing.T) {
			response := testutils.Request(fixture, http.MethodGet, path, "")

			testutils.CheckStatus(t, response, http.StatusUnauthorized)
		})
	}
}

func TestGetMissingPhotoReturnsNotFound(t *testing.T) {
	fixture, _ := newFileLibrary(true)

	for _, path := range []string{photoPath, thumbnailPath} {
		t.Run(path, func(t *testing.T) {
			response := testutils.Request(fixture, http.MethodGet, path, "")

			checkPhotoNotFound(t, response)
		})
	}
}

func TestOwnerCanUploadPhotos(t *testing.T) {
	fixture := newUploadLibrary(true)

	first := readUpload(t, testutils.Request(fixture, http.MethodPost, "/api/photos", uploadRequest("lake.jpg", "image/jpeg", 32<<20)))
	second := readUpload(t, testutils.Request(fixture, http.MethodPost, "/api/photos", uploadRequest("shore.jpg", "image/jpeg", 32<<20)))

	if first.Fields["key"] == second.Fields["key"] {
		t.Fatal("two photos received the same upload key")
	}
	for _, upload := range []uploadForm{first, second} {
		if upload.URL != "https://test-photos.s3.us-east-1.amazonaws.com" {
			t.Fatalf("upload URL = %q, want the private photo bucket", upload.URL)
		}
		if !strings.HasPrefix(upload.Fields["key"], "uploads/") || upload.Fields["X-Amz-Signature"] == "" {
			t.Fatal("upload form is missing a signed key in uploads/")
		}
	}
}

func TestNonOwnerCannotUploadPhotos(t *testing.T) {
	fixture := newUploadLibrary(false)

	response := testutils.Request(fixture, http.MethodPost, "/api/photos", uploadRequest("lake.jpg", "image/jpeg", 1024))

	testutils.CheckStatus(t, response, http.StatusUnauthorized)
}

func TestUploadRejectsInvalidFileTypes(t *testing.T) {
	fixture := newUploadLibrary(true)

	response := testutils.Request(fixture, http.MethodPost, "/api/photos", uploadRequest("lake.png", "image/png", 1024))

	testutils.CheckStatus(t, response, http.StatusBadRequest)
}

func TestUploadRejectsFilesThatAreTooLarge(t *testing.T) {
	fixture := newUploadLibrary(true)

	tooLarge := testutils.Request(fixture, http.MethodPost, "/api/photos", uploadRequest("lake.jpg", "image/jpeg", maxPhotoBytes+1))
	testutils.CheckStatus(t, tooLarge, http.StatusBadRequest)

	largest := readUpload(t, testutils.Request(fixture, http.MethodPost, "/api/photos", uploadRequest("lake.jpg", "image/jpeg", maxPhotoBytes)))

	policy, err := base64.StdEncoding.DecodeString(largest.Fields["policy"])
	if err != nil {
		t.Fatalf("decode S3 upload policy: %v", err)
	}

	var document struct {
		Conditions []json.RawMessage
	}
	if err := json.Unmarshal(policy, &document); err != nil {
		t.Fatalf("read S3 upload policy: %v", err)
	}

	want := fmt.Sprintf(`["content-length-range",%d,%d]`, maxPhotoBytes, maxPhotoBytes)
	for _, condition := range document.Conditions {
		if bytes.Equal(condition, []byte(want)) {
			return
		}
	}
	t.Fatal("S3 upload policy does not enforce the file size")
}

func TestOwnerCanDeletePhoto(t *testing.T) {
	fixture, files := readyPhoto(true)

	response := testutils.Request(fixture, http.MethodDelete, photoPath, "")

	testutils.CheckStatus(t, response, http.StatusNoContent)
	if len(files.urls) != 0 {
		t.Fatalf("photo files remain after deletion: %v", files.urls)
	}
	after := readPage(t, testutils.Request(fixture, http.MethodGet, "/api/photos", ""))
	if len(after.Photos) != 0 {
		t.Fatalf("photo still listed after deletion: %v", after.ids())
	}
}

func TestNonOwnerCannotDeletePhoto(t *testing.T) {
	fixture, files := readyPhoto(false)

	response := testutils.Request(fixture, http.MethodDelete, photoPath, "")

	testutils.CheckStatus(t, response, http.StatusUnauthorized)
	if len(files.urls) != 2 {
		t.Fatal("the files changed after an unauthorized request")
	}
}

func TestOwnerCanRetryPhotoDeletion(t *testing.T) {
	mux, files := readyPhoto(true)
	files.deleteErr = errors.New("storage unavailable")

	failed := testutils.Request(mux, http.MethodDelete, photoPath, "")

	testutils.CheckStatus(t, failed, http.StatusInternalServerError)
	page := readPage(t, testutils.Request(mux, http.MethodGet, "/api/photos", ""))
	if !slices.Equal(page.ids(), []string{"lake"}) {
		t.Fatalf("photos after failed deletion = %v, want [lake]", page.ids())
	}

	files.deleteErr = nil
	retried := testutils.Request(mux, http.MethodDelete, photoPath, "")

	testutils.CheckStatus(t, retried, http.StatusNoContent)
}

func TestDeleteMissingPhotoReturnsNotFound(t *testing.T) {
	fixture, _ := newFileLibrary(true)

	response := testutils.Request(fixture, http.MethodDelete, photoPath, "")

	checkPhotoNotFound(t, response)
}

type photoPage struct {
	Photos []struct {
		ID string `json:"id"`
	} `json:"photos"`
	NextPageToken string `json:"nextPageToken"`
}

func (page photoPage) ids() []string {
	ids := make([]string, 0, len(page.Photos))
	for _, photo := range page.Photos {
		ids = append(ids, photo.ID)
	}
	return ids
}

func readPage(t *testing.T, response *httptest.ResponseRecorder) photoPage {
	t.Helper()
	testutils.CheckStatus(t, response, http.StatusOK)

	var page photoPage
	if err := json.NewDecoder(response.Body).Decode(&page); err != nil {
		t.Fatalf("read photo list: %v", err)
	}
	return page
}

type photoItem struct {
	id         string
	state      string
	uploadKey  string
	uploadedAt string
}

func photo(id, state string, uploadedAt time.Time) photoItem {
	return photoItem{
		id:         id,
		state:      state,
		uploadKey:  uploadedAt.Format("2006-01-02T15:04:05.000000000Z") + "#" + id,
		uploadedAt: uploadedAt.Format(time.RFC3339Nano),
	}
}

func newLibrary(owner bool, items ...photoItem) *http.ServeMux {
	mux, _ := newFileLibrary(owner, items...)
	return mux
}

type photoTable struct {
	items []photoItem
}

func (table photoTable) Query(_ context.Context, input *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	state, _ := input.ExpressionAttributeValues[":state"].(*types.AttributeValueMemberS)
	if aws.ToString(input.IndexName) != "photos-by-state" {
		return nil, fmt.Errorf("expected the photo state index")
	}
	if aws.ToString(input.KeyConditionExpression) != "#state = :state" ||
		input.ExpressionAttributeNames["#state"] != "state" || state == nil {
		return nil, fmt.Errorf("expected query by photo state")
	}

	var items []photoItem
	for _, item := range table.items {
		if item.state == state.Value {
			items = append(items, item)
		}
	}
	slices.SortFunc(items, func(a, b photoItem) int {
		if input.ScanIndexForward != nil && !*input.ScanIndexForward {
			return strings.Compare(b.uploadKey, a.uploadKey)
		}
		return strings.Compare(a.uploadKey, b.uploadKey)
	})

	start, _ := input.ExclusiveStartKey["uploadKey"].(*types.AttributeValueMemberS)
	if start != nil {
		id, _ := input.ExclusiveStartKey["id"].(*types.AttributeValueMemberS)
		startState, _ := input.ExclusiveStartKey["state"].(*types.AttributeValueMemberS)
		index := slices.IndexFunc(items, func(item photoItem) bool {
			return item.uploadKey == start.Value && id != nil && item.id == id.Value
		})
		if index < 0 || startState == nil || startState.Value != state.Value {
			return nil, fmt.Errorf("invalid start key")
		}
		items = items[index+1:]
	}

	output := &dynamodb.QueryOutput{}
	for i, item := range items {
		if input.Limit != nil && i == int(*input.Limit) {
			output.LastEvaluatedKey = map[string]types.AttributeValue{
				"id":        &types.AttributeValueMemberS{Value: items[i-1].id},
				"state":     state,
				"uploadKey": &types.AttributeValueMemberS{Value: items[i-1].uploadKey},
			}
			break
		}

		output.Items = append(output.Items, map[string]types.AttributeValue{
			"id":         &types.AttributeValueMemberS{Value: item.id},
			"name":       &types.AttributeValueMemberS{Value: item.id + ".jpg"},
			"uploadedAt": &types.AttributeValueMemberS{Value: item.uploadedAt},
		})
	}
	return output, nil
}

func (table *photoTable) GetItem(_ context.Context, input *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	id := input.Key["id"].(*types.AttributeValueMemberS).Value
	for _, item := range table.items {
		if item.id == id {
			return &dynamodb.GetItemOutput{Item: map[string]types.AttributeValue{
				"state": &types.AttributeValueMemberS{Value: item.state},
			}}, nil
		}
	}
	return &dynamodb.GetItemOutput{}, nil
}

func (table *photoTable) UpdateItem(_ context.Context, input *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
	id := input.Key["id"].(*types.AttributeValueMemberS).Value
	for i, item := range table.items {
		if item.id != id {
			continue
		}
		switch item.state {
		case "ready", "deleting", "deleted":
			table.items[i] = photoItem{id: id, state: "deleted"}
			return &dynamodb.UpdateItemOutput{}, nil
		}
	}
	return nil, &types.ConditionalCheckFailedException{}
}

func checkPhotoNotFound(t *testing.T, response *httptest.ResponseRecorder) {
	t.Helper()
	testutils.CheckStatus(t, response, http.StatusNotFound)
	if response.Header().Get("Content-Type") != "application/json" {
		t.Fatal("expected a photo API error")
	}
}

func readyPhoto(owner bool) (*http.ServeMux, *fileLibrary) {
	return newFileLibrary(owner, photo("lake", "ready", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)))
}

func newFileLibrary(owner bool, items ...photoItem) (*http.ServeMux, *fileLibrary) {
	mux := http.NewServeMux()
	table := &photoTable{items: items}
	store := photostore.NewDynamoStore(table, "test-photos")
	files := &fileLibrary{urls: make(map[string]string)}
	if len(items) > 0 {
		files.urls[originalKey] = fileOrigin + originalKey
		files.urls[thumbnailKey] = fileOrigin + thumbnailKey
	}

	photos.Register(mux, store, files, func(*http.Request) bool { return owner })
	return mux, files
}

type fileLibrary struct {
	urls      map[string]string
	deleteErr error
}

func (files *fileLibrary) SignUpload(context.Context, string, int64) (photostore.UploadForm, error) {
	return photostore.UploadForm{}, errors.New("unexpected upload")
}

func (files *fileLibrary) OriginalURL(_ context.Context, id string) (string, error) {
	return files.urls["originals/"+id+".jpg"], nil
}

func (files *fileLibrary) ThumbnailURL(_ context.Context, id string) (string, error) {
	return files.urls["thumbnails/"+id+".jpg"], nil
}

func (files *fileLibrary) DeletePhoto(_ context.Context, id string) error {
	if files.deleteErr != nil {
		return files.deleteErr
	}

	delete(files.urls, "originals/"+id+".jpg")
	delete(files.urls, "thumbnails/"+id+".jpg")
	return nil
}

type uploadForm struct {
	URL    string            `json:"url"`
	Fields map[string]string `json:"fields"`
}

func readUpload(t *testing.T, response *httptest.ResponseRecorder) uploadForm {
	t.Helper()
	testutils.CheckStatus(t, response, http.StatusCreated)

	var form uploadForm
	if err := json.NewDecoder(response.Body).Decode(&form); err != nil {
		t.Fatalf("read upload form: %v", err)
	}
	return form
}

func uploadRequest(name, contentType string, size int) string {
	return fmt.Sprintf(`{"name":%q,"contentType":%q,"size":%d}`, name, contentType, size)
}

func newUploadLibrary(owner bool) *http.ServeMux {
	mux := http.NewServeMux()
	client := s3.New(s3.Options{
		Region:      "us-east-1",
		Credentials: aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider("test", "test", "")),
	})
	uploads := photostore.NewS3Store(client, "test-photos")
	photos.Register(mux, nil, uploads, func(*http.Request) bool { return owner })
	return mux
}
