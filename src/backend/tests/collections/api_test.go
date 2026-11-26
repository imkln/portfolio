package collections_test

import (
	"fmt"
	"testing"

	"github.com/imkln/portfolio/src/backend/tests/utils"
)

func TestPublishCollectionAndEditItems(t *testing.T) {
	owner, visitor := utils.StartBackend(t)
	utils.CheckJSON(t, visitor.Request(t, "GET", "/api/collections", "", 200), `{"collections":[]}`)
	const collection = `"id":"lake","title":"Lake","metadata":"Autumn","coverPhotoId":null,"x":0,"y":0,"width":0.5`
	owner.Request(t, "PUT", "/api/collections", `{"collections":[{`+collection+`}]}`, 204)
	t.Cleanup(func() { owner.Request(t, "PUT", "/api/collections", `{"collections":[]}`, 204) })
	utils.CheckJSON(t, visitor.Request(t, "GET", "/api/collections", "", 200), `{"collections":[{`+collection+`}]}`)

	const items = `"items":[{"id":"note","kind":"caption","text":"At the lake","x":0,"y":0,"width":0.5,"height":0.2}]`
	owner.Request(t, "PATCH", "/api/collections/lake", `{`+items+`}`, 204)
	utils.CheckJSON(t, visitor.Request(t, "GET", "/api/collections/lake", "", 200), `{`+collection+`,`+items+`}`)
	owner.Request(t, "PATCH", "/api/collections/lake", `{"items":[{"kind":"caption"}]}`, 400)
	utils.CheckJSON(t, visitor.Request(t, "GET", "/api/collections/lake", "", 200), `{`+collection+`,`+items+`}`)
	const revised = `"id":"lake","title":"Lake Revisited","metadata":"Road trip / 2026","coverPhotoId":null,"x":0,"y":0,"width":0.5`
	owner.Request(t, "PUT", "/api/collections", `{"collections":[{`+revised+`}]}`, 204)
	utils.CheckJSON(t, visitor.Request(t, "GET", "/api/collections/lake", "", 200), `{`+revised+`,`+items+`}`)
	owner.Request(t, "PUT", "/api/collections", `{"collections":[{"id":"lake","x":0.9,"y":0,"width":0.5}]}`, 400)
	utils.CheckJSON(t, visitor.Request(t, "GET", "/api/collections", "", 200), `{"collections":[{`+revised+`}]}`)
	owner.Request(t, "PATCH", "/api/collections/missing", `{"items":[]}`, 404)

	visitor.Request(t, "GET", "/api/collections/missing", "", 404)
}

func TestSavedEmptyCollectionDoesNotShowDefaultCover(t *testing.T) {
	owner, visitor := utils.StartBackend(t)
	id := utils.UploadJPEG(t, owner, "cover.jpg", 8, 8)
	t.Cleanup(func() { owner.Request(t, "DELETE", "/api/photos/"+id, "", 204) })
	const coverCollectionPath = "/api/collections/with-cover"
	utils.CheckJSON(t, visitor.Request(t, "GET", "/api/collections", "", 200), `{"collections":[]}`)
	owner.Request(t, "PUT", "/api/collections", fmt.Sprintf(
		`{"collections":[{"id":"with-cover","title":"Lake","metadata":"","coverPhotoId":%q,"x":0,"y":0,"width":0.5}]}`, id), 204)
	t.Cleanup(func() { owner.Request(t, "PUT", "/api/collections", `{"collections":[]}`, 204) })
	var collection struct {
		Items []struct {
			Kind          string `json:"kind"`
			CoverPhotoID  string `json:"coverPhotoId"`
			CoverPhotoURL string `json:"coverPhotoUrl"`
		} `json:"items"`
	}
	utils.Decode(t, visitor.Request(t, "GET", coverCollectionPath, "", 200), &collection)
	if len(collection.Items) != 1 || collection.Items[0].Kind != "photo" ||
		collection.Items[0].CoverPhotoID != id || collection.Items[0].CoverPhotoURL == "" {
		t.Fatal("collection without saved items did not include its cover photo")
	}
	owner.Request(t, "PATCH", coverCollectionPath, `{"items":[]}`, 204)
	utils.Decode(t, visitor.Request(t, "GET", coverCollectionPath, "", 200), &collection)
	if collection.Items == nil || len(collection.Items) != 0 {
		t.Fatal("explicitly cleared collection did not return an empty item list")
	}

}
