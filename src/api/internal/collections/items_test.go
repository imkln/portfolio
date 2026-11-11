package collections_test

import (
	"net/http"
	"testing"

	"github.com/imkln/portfolio/src/api/internal/testutils"
)

const lakePath = "/api/collections/lake"
const lake = `{"id":"lake","title":"Lake","metadata":"Autumn","coverPhotoId":"shore","coverPhotoUrl":"https://photos.example.test/originals/shore.jpg?signature=test","x":0,"y":0.5,"width":0.3,`
const photoItem = `{"id":"shore-photo","kind":"photo","coverPhotoId":"shore","x":0,"y":0,"width":0.5}`
const listedPhotoItem = `{"id":"shore-photo","kind":"photo","coverPhotoId":"shore","coverPhotoUrl":"https://photos.example.test/originals/shore.jpg?signature=test","x":0,"y":0,"width":0.5}`
const captionItem = `{"id":"note","kind":"caption","text":"Along the shore","x":0.6,"y":0.1,"width":0.3,"height":0.12}`
const itemsUpdate = `{"items":[` + photoItem + "," + captionItem + `]}`
const lakeWithItems = lake + `"items":[` + listedPhotoItem + "," + captionItem + `]}`

func collectionFixture(t *testing.T, email string) *testutils.Auth {
	t.Helper()

	store := testDynamoStore(t)
	if err := seedCollections(t, store); err != nil {
		t.Fatalf("seed collections: %v", err)
	}
	return newFixture(t, store, email)
}

func TestCanGetCollection(t *testing.T) {
	fixture := collectionFixture(t, testutils.OwnerEmail)
	cookie := fixture.SignIn(t)
	saved := testutils.Request(fixture.Mux, http.MethodPatch, lakePath, itemsUpdate, cookie)
	testutils.CheckStatus(t, saved, http.StatusNoContent)

	response := testutils.Request(fixture.Mux, http.MethodGet, lakePath, "")

	checkCollections(t, response, lakeWithItems)
}

func TestOwnerCanUpdateCollectionItems(t *testing.T) {
	fixture := collectionFixture(t, testutils.OwnerEmail)
	cookie := fixture.SignIn(t)

	saved := testutils.Request(fixture.Mux, http.MethodPatch, lakePath, itemsUpdate, cookie)
	testutils.CheckStatus(t, saved, http.StatusNoContent)
	cleared := testutils.Request(fixture.Mux, http.MethodPatch, lakePath, `{"items":[]}`, cookie)

	testutils.CheckStatus(t, cleared, http.StatusNoContent)
	checkCollections(t, testutils.Request(fixture.Mux, http.MethodGet, lakePath, ""), lake+`"items":[]}`)
}

func TestNonOwnerCannotUpdateCollectionItems(t *testing.T) {
	fixture := collectionFixture(t, testutils.NonOwnerEmail)
	before := testutils.Request(fixture.Mux, http.MethodGet, lakePath, "")
	testutils.CheckStatus(t, before, http.StatusOK)

	response := testutils.Request(fixture.Mux, http.MethodPatch, lakePath, itemsUpdate)

	testutils.CheckStatus(t, response, http.StatusUnauthorized)
	checkCollections(t, testutils.Request(fixture.Mux, http.MethodGet, lakePath, ""), before.Body.String())
}

func TestCannotUpdateCollectionWithInvalidItems(t *testing.T) {
	fixture := collectionFixture(t, testutils.OwnerEmail)
	cookie := fixture.SignIn(t)
	saved := testutils.Request(fixture.Mux, http.MethodPatch, lakePath, itemsUpdate, cookie)
	testutils.CheckStatus(t, saved, http.StatusNoContent)

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
			response := testutils.Request(fixture.Mux, http.MethodPatch, lakePath, test.body, cookie)

			testutils.CheckStatus(t, response, http.StatusBadRequest)
			checkCollections(t, testutils.Request(fixture.Mux, http.MethodGet, lakePath, ""), lakeWithItems)
		})
	}
}

func TestGetMissingCollectionReturnsNotFound(t *testing.T) {
	fixture := collectionFixture(t, testutils.NonOwnerEmail)

	response := testutils.Request(fixture.Mux, http.MethodGet, "/api/collections/missing", "")

	testutils.CheckStatus(t, response, http.StatusNotFound)
	if response.Body.String() != "{\"error\":\"Not Found\"}\n" {
		t.Fatalf("unexpected error body: %s", response.Body)
	}
}

func TestUpdateMissingCollectionReturnsNotFound(t *testing.T) {
	fixture := collectionFixture(t, testutils.OwnerEmail)
	cookie := fixture.SignIn(t)

	response := testutils.Request(fixture.Mux, http.MethodPatch, "/api/collections/missing", itemsUpdate, cookie)

	testutils.CheckStatus(t, response, http.StatusNotFound)
	if response.Body.String() != "{\"error\":\"Not Found\"}\n" {
		t.Fatalf("unexpected error body: %s", response.Body)
	}
}

func TestReplacingCollectionsPreservesItems(t *testing.T) {
	fixture := collectionFixture(t, testutils.OwnerEmail)
	cookie := fixture.SignIn(t)
	saved := testutils.Request(fixture.Mux, http.MethodPatch, lakePath, itemsUpdate, cookie)
	testutils.CheckStatus(t, saved, http.StatusNoContent)

	updated := testutils.Request(fixture.Mux, http.MethodPut, "/api/collections", savedCollections, cookie)

	testutils.CheckStatus(t, updated, http.StatusNoContent)
	checkCollections(t, testutils.Request(fixture.Mux, http.MethodGet, lakePath, ""), lakeWithItems)
}
