package photos_test

import (
	"encoding/json"
	"reflect"
	"slices"
	"testing"

	"github.com/imkln/portfolio/src/backend/tests/utils"
)

func PhotoDeletionCanBeRetried(t *testing.T, request utils.APIRequest, id string, restoreStorage func()) {
	t.Helper()

	path := "/api/photos/" + id
	utils.CheckAPIResponse(t, request, "DELETE", path, "", 500)
	utils.CheckAPIResponse(t, request, "GET", path, "", 307)

	restoreStorage()
	utils.CheckAPIResponse(t, request, "DELETE", path, "", 204)
	utils.CheckAPIResponse(t, request, "GET", path, "", 404)
	utils.CheckAPIResponse(t, request, "GET", path+"/thumbnail", "", 404)
}

func PhotoTagConflict(t *testing.T, request utils.APIRequest, edit string, expected map[string][]string) {
	t.Helper()

	utils.CheckAPIResponse(t, request, "PATCH", "/api/photos", edit, 409)
	body := utils.CheckAPIResponse(t, request, "GET", "/api/photos", "", 200)
	var page struct {
		Photos []struct {
			ID     string   `json:"id"`
			TagIDs []string `json:"tagIds"`
		} `json:"photos"`
	}
	if err := json.Unmarshal(body, &page); err != nil {
		t.Fatal(err)
	}
	got := make(map[string][]string, len(page.Photos))
	for _, photo := range page.Photos {
		slices.Sort(photo.TagIDs)
		got[photo.ID] = photo.TagIDs
	}
	if !reflect.DeepEqual(got, expected) {
		t.Fatalf("tags after rejected update = %v, want %v", got, expected)
	}
}
