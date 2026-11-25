package photos_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"net/url"
	"slices"
	"testing"
	"time"

	"github.com/imkln/portfolio/src/backend/tests/utils"
)

func TestUploadTagDownloadAndDeletePhoto(t *testing.T) {
	owner, _ := utils.StartBackend(t)
	utils.CheckJSON(t, owner.Request(t, "GET", "/api/photos", "", 200), `{"photos":[]}`)
	owner.Request(t, "POST", "/api/photos", `{"name":"lake.png","contentType":"image/png","size":100}`, 400)
	owner.Request(t, "POST", "/api/photos", `{"name":"too-large.jpg","contentType":"image/jpeg","size":67108865}`, 400)
	owner.Request(t, "GET", "/api/photos/missing/thumbnail", "", 404)
	owner.Request(t, "DELETE", "/api/photos/missing", "", 404)

	var original bytes.Buffer
	if err := jpeg.Encode(&original, image.NewRGBA(image.Rect(0, 0, 600, 400)), nil); err != nil {
		t.Fatal(err)
	}
	owner.SubmitUpload(t, "lake-upload.jpg", original.Bytes())
	id := owner.WaitForPhotos(t, []string{"lake-upload.jpg"})["lake-upload.jpg"].ID
	deleted := false
	t.Cleanup(func() {
		if !deleted {
			owner.Request(t, "DELETE", "/api/photos/"+url.PathEscape(id), "", 204)
		}
	})
	path := "/api/photos/" + url.PathEscape(id)
	if got := owner.Download(t, path); !bytes.Equal(got, original.Bytes()) {
		t.Fatal("downloaded original differs from the uploaded JPEG")
	}
	config, err := jpeg.DecodeConfig(bytes.NewReader(owner.Download(t, path+"/thumbnail")))
	if err != nil || config.Width != 480 || config.Height != 320 {
		t.Fatalf("thumbnail = %d × %d, error %v; want 480 × 320 JPEG", config.Width, config.Height, err)
	}

	parent := owner.CreateTag(t, "Alpine Region", "")
	parentPath := "/api/tags/" + url.PathEscape(parent)
	t.Cleanup(func() { owner.Request(t, "DELETE", parentPath, "", 204) })
	child := owner.CreateTag(t, "Alpine Lake", parent)
	t.Cleanup(func() { owner.Request(t, "DELETE", "/api/tags/"+url.PathEscape(child), "", 204) })
	edit, err := json.Marshal(map[string][]string{"photoIds": {id}, "addTagIds": {child}})
	if err != nil {
		t.Fatal(err)
	}
	owner.Request(t, "PATCH", "/api/photos", string(edit), 204)
	owner.Request(t, "PATCH", "/api/photos", fmt.Sprintf(`{"photoIds":[%q,"missing-photo"],"removeTagIds":[%q]}`, id, child), 404)
	filter := "/api/photos?tagId=" + url.QueryEscape(parent)
	page := owner.Photos(t, filter)
	if len(page) != 1 || page[0].ID != id || !slices.Equal(page[0].TagIDs, []string{child}) {
		t.Fatalf("parent filter returned %+v; want the upload with its child tag", page)
	}

	owner.Request(t, "DELETE", path, "", 204)
	deleted = true
	owner.Request(t, "GET", path, "", 404)
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		if len(owner.Photos(t, "/api/photos")) == 0 {
			return
		}
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatal("deleted photo still appears in the library")
}

func TestListEveryPhotoAcrossPages(t *testing.T) {
	owner, _ := utils.StartBackend(t)
	utils.CheckJSON(t, owner.Request(t, "GET", "/api/photos", "", 200), `{"photos":[]}`)
	owner.Request(t, "GET", "/api/photos?pageToken=invalid", "", 400)

	var imageBytes bytes.Buffer
	if err := jpeg.Encode(&imageBytes, image.NewRGBA(image.Rect(0, 0, 8, 8)), nil); err != nil {
		t.Fatal(err)
	}
	names := make([]string, 25)
	for i := range names {
		names[i] = fmt.Sprintf("page-%02d.jpg", i)
		owner.SubmitUpload(t, names[i], imageBytes.Bytes())
	}

	library := owner.WaitForPhotos(t, names)
	t.Cleanup(func() {
		for _, photo := range library {
			owner.Request(t, "DELETE", "/api/photos/"+url.PathEscape(photo.ID), "", 204)
		}
	})
	first := owner.PhotoPage(t, "/api/photos")
	if len(first.Photos) != 24 || first.NextPageToken == "" {
		t.Fatalf("first page has %d photos and continuation=%t; want 24 and a continuation", len(first.Photos), first.NextPageToken != "")
	}
	second := owner.PhotoPage(t, "/api/photos?pageToken="+url.QueryEscape(first.NextPageToken))
	if len(second.Photos) != 1 || second.NextPageToken != "" {
		t.Fatalf("second page has %d photos and continuation=%t; want 1 and no continuation", len(second.Photos), second.NextPageToken != "")
	}
	seen := make(map[string]bool, len(names))
	var previous time.Time
	for _, photo := range append(first.Photos, second.Photos...) {
		if seen[photo.ID] || library[photo.Name].ID != photo.ID || (!previous.IsZero() && photo.UploadedAt.After(previous)) {
			t.Fatalf("unexpected, repeated, or out-of-order photo: %+v", photo)
		}
		seen[photo.ID] = true
		previous = photo.UploadedAt
	}
}
