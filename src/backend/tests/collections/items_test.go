package collections_test

import (
	"net/http"
	"testing"

	"github.com/imkln/portfolio/src/backend/tests/utils"
)

const lakePath = "/api/collections/lake"
const lake = `{"id":"lake","title":"Lake","metadata":"Autumn","coverPhotoId":"shore","coverPhotoUrl":"https://photos.example.test/originals/shore.jpg?signature=test","x":0,"y":0.5,"width":0.3,`
const photoItem = `{"id":"shore-photo","kind":"photo","coverPhotoId":"shore","x":0,"y":0,"width":0.5}`
const listedPhotoItem = `{"id":"shore-photo","kind":"photo","coverPhotoId":"shore","coverPhotoUrl":"https://photos.example.test/originals/shore.jpg?signature=test","x":0,"y":0,"width":0.5}`
const captionItem = `{"id":"note","kind":"caption","text":"Along the shore","x":0.6,"y":0.1,"width":0.3,"height":0.12,"largeText":true,"lightText":true}`
const itemsUpdate = `{"items":[` + photoItem + "," + captionItem + `]}`
const lakeWithItems = lake + `"items":[` + listedPhotoItem + "," + captionItem + `]}`

func collectionFixture(t *testing.T, owner bool) *http.ServeMux {
	t.Helper()

	store := testDynamoStore(t)
	if err := seedCollections(t, store); err != nil {
		t.Fatalf("seed collections: %v", err)
	}
	return newFixture(store, owner)
}

func TestVisitorSeesCoverWhenNoItemsAreSaved(t *testing.T) {
	fixture := collectionFixture(t, false)

	response := utils.Request(fixture, http.MethodGet, lakePath, "")

	checkCollections(t, response, lake+`"items":[{"id":"cover","kind":"photo","coverPhotoId":"shore","coverPhotoUrl":"https://photos.example.test/originals/shore.jpg?signature=test","x":0,"y":0,"width":0.53}]}`)
}

func TestOwnerCanReplaceCollectionItems(t *testing.T) {
	fixture := collectionFixture(t, true)

	saved := utils.Request(fixture, http.MethodPatch, lakePath, itemsUpdate)

	utils.CheckStatus(t, saved, http.StatusNoContent)
	checkCollections(t, utils.Request(fixture, http.MethodGet, lakePath, ""), lakeWithItems)
}

func TestNonOwnerCannotUpdateCollectionItems(t *testing.T) {
	fixture := collectionFixture(t, false)
	before := utils.Request(fixture, http.MethodGet, lakePath, "")
	utils.CheckStatus(t, before, http.StatusOK)

	response := utils.Request(fixture, http.MethodPatch, lakePath, itemsUpdate)

	utils.CheckStatus(t, response, http.StatusUnauthorized)
	checkCollections(t, utils.Request(fixture, http.MethodGet, lakePath, ""), before.Body.String())
}

func TestCannotUpdateCollectionWithInvalidItems(t *testing.T) {
	fixture := collectionFixture(t, true)
	saved := utils.Request(fixture, http.MethodPatch, lakePath, itemsUpdate)
	utils.CheckStatus(t, saved, http.StatusNoContent)

	for _, test := range []struct {
		name string
		body string
	}{
		{"duplicate IDs", `{"items":[` + photoItem + "," + photoItem + `]}`},
		{"invalid position", `{"items":[{"id":"note","kind":"caption","text":"Lake","x":0.9,"y":0,"width":0.5,"height":0.1}]}`},
		{"invalid photo ID", `{"items":[{"id":"photo","kind":"photo","coverPhotoId":"../shore","x":0,"y":0,"width":0.5}]}`},
		{"missing caption height", `{"items":[{"id":"note","kind":"caption","text":"Lake","x":0,"y":0,"width":0.5}]}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := utils.Request(fixture, http.MethodPatch, lakePath, test.body)

			utils.CheckStatus(t, response, http.StatusBadRequest)
			checkCollections(t, utils.Request(fixture, http.MethodGet, lakePath, ""), lakeWithItems)
		})
	}
}
