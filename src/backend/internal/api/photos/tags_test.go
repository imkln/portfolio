package photos_test

import (
	"context"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/imkln/portfolio/src/backend/internal/api/testutils"
)

func TestCanEditTagsOnSelectedPhotos(t *testing.T) {
	app := taggedLibrary(true)

	response := testutils.Request(app, http.MethodPatch, "/api/photos", `{"photoIds":["a","b"],"addTagIds":["paris"],"removeTagIds":["lyon"]}`)

	testutils.CheckStatus(t, response, http.StatusNoContent)
	checkTags(t, app, "a", "france", "paris")
	checkTags(t, app, "b", "paris")
}

func TestInvalidTagEditKeepsPhotosUnchanged(t *testing.T) {
	for _, tc := range []struct{ name, body string }{
		{"missing photo", `{"photoIds":["a","missing"],"addTagIds":["paris"]}`},
		{"missing tag", `{"photoIds":["a","b"],"addTagIds":["missing"]}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app := taggedLibrary(true)

			response := testutils.Request(app, http.MethodPatch, "/api/photos", tc.body)

			testutils.CheckStatus(t, response, http.StatusNotFound)
			checkTags(t, app, "a", "france", "lyon")
			checkTags(t, app, "b", "lyon")
		})
	}
}

func TestPhotoTagEditsRequireOwner(t *testing.T) {
	app := taggedLibrary(false)

	response := testutils.Request(app, http.MethodPatch, "/api/photos", `{"photoIds":["a"],"addTagIds":["paris"]}`)

	testutils.CheckStatus(t, response, http.StatusUnauthorized)
}

func taggedLibrary(owner bool) http.Handler {
	a := photo("a", "ready", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	b := photo("b", "ready", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	a.tagIDs = []string{"france", "lyon"}
	b.tagIDs = []string{"lyon"}
	return newLibrary(owner, a, b)
}

func checkTags(t *testing.T, app http.Handler, id string, want ...string) {
	t.Helper()
	page := readPage(t, testutils.Request(app, http.MethodGet, "/api/photos", ""))
	for _, photo := range page.Photos {
		if photo.ID != id {
			continue
		}
		slices.Sort(photo.TagIDs)
		if !slices.Equal(photo.TagIDs, want) {
			t.Fatalf("tags on %s = %v, want %v", id, photo.TagIDs, want)
		}
		return
	}
	t.Fatalf("photo %s is missing", id)
}

func (table *photoTable) TransactWriteItems(_ context.Context, input *dynamodb.TransactWriteItemsInput, _ ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
	items := slices.Clone(table.items)
	for _, write := range input.TransactItems {
		update := write.Update
		id := update.Key["id"].(*types.AttributeValueMemberS).Value
		index := slices.IndexFunc(items, func(item photoItem) bool { return item.id == id && item.state == "ready" })
		if index < 0 {
			return nil, &types.TransactionCanceledException{}
		}

		tags, _ := update.ExpressionAttributeValues[":after"].(*types.AttributeValueMemberSS)
		items[index].tagIDs = nil
		if tags != nil {
			items[index].tagIDs = slices.Clone(tags.Value)
		}
	}
	table.items = items
	return &dynamodb.TransactWriteItemsOutput{}, nil
}
