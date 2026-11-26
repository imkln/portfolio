package collections_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"github.com/imkln/portfolio/src/backend/internal/api/router"
	"github.com/imkln/portfolio/src/backend/internal/domain/collections"
	collectionsstore "github.com/imkln/portfolio/src/backend/internal/infra/persistence/collections"
	"github.com/imkln/portfolio/src/backend/internal/usecase"
	"github.com/imkln/portfolio/src/backend/tests/utils"
)

const savedCollections = `{"collections":[{"id":"lake","title":"Lake","metadata":"Autumn","coverPhotoId":"shore","x":0,"y":0.5,"width":0.3}]}`
const savedCollectionsResponse = `{"collections":[{"id":"lake","title":"Lake","metadata":"Autumn","coverPhotoId":"shore","coverPhotoUrl":"https://photos.example.test/originals/shore.jpg?signature=test","x":0,"y":0.5,"width":0.3}]}`
const changedCollections = `{"collections":[{"id":"forest","title":"Forest","metadata":"Spring","coverPhotoId":null,"x":0.2,"y":0.9,"width":0.45,"textLayout":{"x":0.7,"y":0.9,"width":0.25},"largeText":true,"lightText":true}]}`
const emptyCollections = `{"collections":[]}`

func TestNonOwnerCanListCollections(t *testing.T) {
	fixture := newFixture(savedStore(t), false)

	response := utils.Request(fixture, http.MethodGet, "/api/collections", "")

	checkCollections(t, response, savedCollectionsResponse)
}

func TestCollectionsReturnsEmptyListWhenNoneAreSaved(t *testing.T) {
	fixture := newFixture(testDynamoStore(t), false)

	response := utils.Request(fixture, http.MethodGet, "/api/collections", "")

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
			if err := seedCollections(t, store); err != nil {
				t.Fatalf("seed collections: %v", err)
			}
			fixture := newFixture(store, true)

			saved := utils.Request(fixture, http.MethodPut, "/api/collections", test.config)
			utils.CheckStatus(t, saved, http.StatusNoContent)
			loaded := utils.Request(fixture, http.MethodGet, "/api/collections", "")

			checkCollections(t, loaded, test.config)
		})
	}
}

func TestNonOwnerCannotReplaceCollections(t *testing.T) {
	mux := newFixture(savedStore(t), false)

	response := utils.Request(mux, http.MethodPut, "/api/collections", changedCollections)

	utils.CheckStatus(t, response, http.StatusUnauthorized)
	checkCollections(t, utils.Request(mux, http.MethodGet, "/api/collections", ""), savedCollectionsResponse)
}

func TestCollectionsRejectInvalidReplacements(t *testing.T) {
	fixture := newFixture(savedStore(t), true)

	for _, test := range []struct {
		name   string
		config string
	}{
		{"malformed JSON", `{"collections":`},
		{"duplicate IDs", `{"collections":[{"id":"lake","x":0,"y":0,"width":0.2},{"id":"lake","x":0,"y":1,"width":0.2}]}`},
		{"invalid layout", `{"collections":[{"id":"lake","x":0.9,"y":0,"width":0.3}]}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := utils.Request(fixture, http.MethodPut, "/api/collections", test.config)

			utils.CheckStatus(t, response, http.StatusBadRequest)
			checkCollections(t, utils.Request(fixture, http.MethodGet, "/api/collections", ""), savedCollectionsResponse)
		})
	}
}

func TestListCollectionsFailsWhenStorageIsUnavailable(t *testing.T) {
	store := &testCollectionStore{readErr: errors.New("storage unavailable")}
	fixture := newFixture(store, false)

	CollectionReadUnavailable(t, func(method, path, body string) *http.Response {
		return utils.Request(fixture, method, path, body).Result()
	})
}

func TestReplaceCollectionsFailsWhenStorageIsUnavailable(t *testing.T) {
	store := savedStore(t)
	store.writeErr = errors.New("storage unavailable")
	fixture := newFixture(store, true)

	CollectionWriteUnavailable(t, func(method, path, body string) *http.Response {
		return utils.Request(fixture, method, path, body).Result()
	}, changedCollections)
}

func TestUpdateCollectionsReturnsConflictWhenSavedDataChanged(t *testing.T) {
	dynamo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Header.Get("X-Amz-Target") {
		case "DynamoDB_20120810.GetItem":
			utils.WriteJSON(t, w, struct{}{})
		case "DynamoDB_20120810.PutItem":
			w.Header().Set("Content-Type", "application/x-amz-json-1.0")
			w.WriteHeader(http.StatusBadRequest)
			if _, err := w.Write([]byte(`{"__type":"com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException"}`)); err != nil {
				t.Errorf("write DynamoDB conflict response: %v", err)
			}
		default:
			t.Errorf("unexpected DynamoDB operation: %s", r.Header.Get("X-Amz-Target"))
			w.WriteHeader(http.StatusBadRequest)
		}
	}))
	t.Cleanup(dynamo.Close)

	client := dynamodb.New(dynamodb.Options{
		Region:       "us-east-1",
		BaseEndpoint: aws.String(dynamo.URL),
		Credentials:  credentials.NewStaticCredentialsProvider("test", "test", ""),
	})
	mux := http.NewServeMux()
	router.Collections(mux, collectionsstore.NewDynamoStore(client, "test-collections"), func(*http.Request) bool { return true }, nil)

	CollectionWriteConflict(t, func(method, path, body string) *http.Response {
		return utils.Request(mux, method, path, body).Result()
	}, changedCollections)
}

type testCollectionStore struct {
	config   collections.List
	readErr  error
	writeErr error
}

func (store *testCollectionStore) Load(context.Context) (collections.List, error) {
	return store.config, store.readErr
}

func (store *testCollectionStore) Update(_ context.Context, change func(*collections.List) error) error {
	if store.writeErr != nil {
		return store.writeErr
	}
	return change(&store.config)
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
	utils.CheckStatus(t, response, http.StatusOK)

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

func testDynamoStore(t *testing.T) usecase.CollectionStore {
	t.Helper()

	return collectionsstore.NewDynamoStore(utils.NewFakeDynamoClient(t), "test-collections")
}

func newFixture(store usecase.CollectionStore, owner bool) *http.ServeMux {
	mux := http.NewServeMux()
	router.Collections(mux, store, func(*http.Request) bool { return owner }, func(_ context.Context, id string) (string, error) {
		return "https://photos.example.test/originals/" + id + ".jpg?signature=test", nil
	})
	return mux
}

func seedCollections(t *testing.T, store usecase.CollectionStore) error {
	t.Helper()

	return store.Update(t.Context(), func(config *collections.List) error {
		*config = savedStore(t).config
		return nil
	})
}
