package photos_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/imkln/portfolio/src/api/internal/photos"
	"github.com/imkln/portfolio/src/api/internal/testutils"
)

func TestOwnerCanListPhotos(t *testing.T) {
	older := photo("older", "ready", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	newer := photo("newer", "ready", time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC))
	fixture := newLibrary(t, older, newer)
	owner := fixture.SignIn(t)

	response := testutils.Request(fixture.Mux, http.MethodGet, "/api/photos", "", owner)

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
	fixture := newLibrary(t, items...)
	owner := fixture.SignIn(t)

	first := readPage(t, testutils.Request(fixture.Mux, http.MethodGet, "/api/photos", "", owner))
	if len(first.Photos) != 24 || first.NextPageToken == "" {
		t.Fatalf("first page has %d photos and token %q, want 24 photos and a token", len(first.Photos), first.NextPageToken)
	}

	path := "/api/photos?pageToken=" + url.QueryEscape(first.NextPageToken)
	next := readPage(t, testutils.Request(fixture.Mux, http.MethodGet, path, "", owner))

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
	fixture := newLibrary(t,
		photo("ready", "ready", uploadedAt),
		photo("uploading", "uploading", uploadedAt),
		photo("processing", "processing", uploadedAt),
	)
	owner := fixture.SignIn(t)

	response := testutils.Request(fixture.Mux, http.MethodGet, "/api/photos", "", owner)

	page := readPage(t, response)
	if got := page.ids(); !slices.Equal(got, []string{"ready"}) {
		t.Fatalf("photos = %v, want [ready]", got)
	}
}

func TestNonOwnerCannotListPhotos(t *testing.T) {
	fixture := newLibrary(t)

	response := testutils.Request(fixture.Mux, http.MethodGet, "/api/photos", "")

	testutils.CheckStatus(t, response, http.StatusUnauthorized)
}

func TestListRejectsInvalidPageToken(t *testing.T) {
	fixture := newLibrary(t)
	owner := fixture.SignIn(t)

	response := testutils.Request(fixture.Mux, http.MethodGet, "/api/photos?pageToken=invalid!", "", owner)

	testutils.CheckStatus(t, response, http.StatusBadRequest)
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

func newLibrary(t *testing.T, items ...photoItem) *testutils.Auth {
	t.Helper()
	fixture := testutils.NewAuth(t, testutils.OwnerEmail)
	photos.Register(fixture.Mux, photos.NewDynamoStore(photoTable{items}, "test-photos"), fixture.Sessions.IsOwner)
	return fixture
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
