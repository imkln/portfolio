package collections_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/imkln/portfolio/src/api/internal/collections"
	"github.com/imkln/portfolio/src/api/internal/testutils"
)

const savedCollections = `{"collections":[{"id":"lake","title":"Lake","metadata":"Autumn","coverPhotoId":"shore","x":0,"y":0.5,"width":0.3}]}`
const savedCollectionsResponse = `{"collections":[{"id":"lake","title":"Lake","metadata":"Autumn","coverPhotoId":"shore","coverPhotoUrl":"https://photos.example.test/originals/shore.jpg?signature=test","x":0,"y":0.5,"width":0.3}]}`
const changedCollections = `{"collections":[{"id":"forest","title":"Forest","metadata":"Spring","coverPhotoId":null,"x":0.2,"y":0.9,"width":0.45}]}`
const emptyCollections = `{"collections":[]}`

func TestNonOwnerCanListCollections(t *testing.T) {
	fixture := newFixture(t, savedStore(t), testutils.NonOwnerEmail)

	response := testutils.Request(fixture.Mux, http.MethodGet, "/api/collections", "")

	checkCollections(t, response, savedCollectionsResponse)
}

func TestCollectionsReturnsEmptyListWhenNoneAreSaved(t *testing.T) {
	fixture := newFixture(t, testDynamoStore(t), testutils.NonOwnerEmail)

	response := testutils.Request(fixture.Mux, http.MethodGet, "/api/collections", "")

	checkCollections(t, response, emptyCollections)
}

func TestOwnerCanReplaceCollections(t *testing.T) {
	for _, test := range []struct {
		name   string
		config string
	}{
		{"populated config", changedCollections},
		{"empty config", emptyCollections},
	} {
		t.Run(test.name, func(t *testing.T) {
			store := testDynamoStore(t)
			if err := store.Save(t.Context(), savedStore(t).config); err != nil {
				t.Fatalf("seed collections: %v", err)
			}
			fixture := newFixture(t, store, testutils.OwnerEmail)
			cookie := fixture.SignIn(t)

			saved := testutils.Request(fixture.Mux, http.MethodPut, "/api/collections", test.config, cookie)
			testutils.CheckStatus(t, saved, http.StatusNoContent)
			loaded := testutils.Request(fixture.Mux, http.MethodGet, "/api/collections", "")

			checkCollections(t, loaded, test.config)
		})
	}
}

func TestNonOwnerCannotReplaceCollections(t *testing.T) {
	for _, test := range []struct {
		name      string
		trySignIn bool
	}{
		{"signed out", false},
		{"after non-owner sign-in", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			fixture := newFixture(t, savedStore(t), testutils.NonOwnerEmail)
			var cookies []*http.Cookie
			if test.trySignIn {
				callback := fixture.Callback(t)
				testutils.CheckStatus(t, callback, http.StatusSeeOther)
				for _, cookie := range callback.Result().Cookies() {
					if cookie.MaxAge >= 0 {
						cookies = append(cookies, cookie)
					}
				}
			}

			response := testutils.Request(fixture.Mux, http.MethodPut, "/api/collections", changedCollections, cookies...)

			testutils.CheckStatus(t, response, http.StatusUnauthorized)
			checkCollections(t, testutils.Request(fixture.Mux, http.MethodGet, "/api/collections", ""), savedCollectionsResponse)
		})
	}
}

func TestCollectionsRejectInvalidReplacements(t *testing.T) {
	fixture := newFixture(t, savedStore(t), testutils.OwnerEmail)
	cookie := fixture.SignIn(t)

	for _, test := range []struct {
		name   string
		config string
	}{
		{"malformed JSON", `{"collections":`},
		{"duplicate IDs", `{"collections":[{"id":"lake","x":0,"y":0,"width":0.2},{"id":"lake","x":0,"y":1,"width":0.2}]}`},
		{"invalid layout", `{"collections":[{"id":"lake","x":0.9,"y":0,"width":0.3}]}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := testutils.Request(fixture.Mux, http.MethodPut, "/api/collections", test.config, cookie)

			testutils.CheckStatus(t, response, http.StatusBadRequest)
			checkCollections(t, testutils.Request(fixture.Mux, http.MethodGet, "/api/collections", ""), savedCollectionsResponse)
		})
	}
}

func TestListCollectionsFailsWhenStorageIsUnavailable(t *testing.T) {
	store := &testCollectionStore{readErr: errors.New("storage unavailable")}
	fixture := newFixture(t, store, testutils.NonOwnerEmail)

	response := testutils.Request(fixture.Mux, http.MethodGet, "/api/collections", "")

	testutils.CheckStatus(t, response, http.StatusInternalServerError)
}

func TestReplaceCollectionsFailsWhenStorageIsUnavailable(t *testing.T) {
	store := &testCollectionStore{writeErr: errors.New("storage unavailable")}
	fixture := newFixture(t, store, testutils.OwnerEmail)
	cookie := fixture.SignIn(t)

	response := testutils.Request(fixture.Mux, http.MethodPut, "/api/collections", changedCollections, cookie)

	testutils.CheckStatus(t, response, http.StatusInternalServerError)
}

type testCollectionStore struct {
	config   collections.List
	readErr  error
	writeErr error
}

func (store *testCollectionStore) Load(context.Context) (collections.List, error) {
	return store.config, store.readErr
}

func (store *testCollectionStore) Save(_ context.Context, config collections.List) error {
	if store.writeErr != nil {
		return store.writeErr
	}
	store.config = config
	return nil
}

func savedStore(t *testing.T) *testCollectionStore {
	t.Helper()

	store := &testCollectionStore{}
	if err := json.Unmarshal([]byte(savedCollections), &store.config); err != nil {
		t.Fatal(err)
	}
	return store
}

func checkCollections(t *testing.T, response *httptest.ResponseRecorder, expected string) {
	t.Helper()
	testutils.CheckStatus(t, response, http.StatusOK)

	var got, want any
	if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(expected), &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("collections = %s, want %s", response.Body, expected)
	}
}

func testDynamoStore(t *testing.T) collections.Store {
	t.Helper()

	return collections.NewDynamoStore(testutils.NewFakeDynamoClient(t), "test-collections")
}

func newFixture(t *testing.T, store collections.Store, email string) *testutils.Auth {
	t.Helper()

	fixture := testutils.NewAuth(t, email)
	collections.Register(fixture.Mux, store, fixture.Sessions.IsOwner, func(_ context.Context, id string) (string, error) {
		return "https://photos.example.test/originals/" + id + ".jpg?signature=test", nil
	})
	return fixture
}
