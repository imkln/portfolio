package photos_test

import (
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"testing"
	"time"

	"github.com/imkln/portfolio/src/backend/internal/api/testutils"
)

func TestFilterMatchesTag(t *testing.T) {
	app := newLibrary(true, photoWithTags("a", "france"), photoWithTags("b"))

	page := readPage(t, testutils.Request(app, http.MethodGet, "/api/photos?tagId=france", ""))

	if !slices.Equal(page.ids(), []string{"a"}) {
		t.Fatalf("photos = %v, want [a]", page.ids())
	}
}

func TestFilterIncludesNestedTags(t *testing.T) {
	app := newLibrary(true, photoWithTags("a", "paris"), photoWithTags("b", "architecture"))

	page := readPage(t, testutils.Request(app, http.MethodGet, "/api/photos?tagId=france", ""))

	if !slices.Equal(page.ids(), []string{"a"}) {
		t.Fatalf("photos = %v, want [a]", page.ids())
	}
}

func TestPhotoMatchesEverySelectedFilter(t *testing.T) {
	app := newLibrary(true,
		photoWithTags("a", "france", "architecture"),
		photoWithTags("b", "france"),
		photoWithTags("c", "architecture"),
	)

	page := readPage(t, testutils.Request(app, http.MethodGet, "/api/photos?tagId=france&tagId=architecture", ""))

	if !slices.Equal(page.ids(), []string{"a"}) {
		t.Fatalf("photos = %v, want [a]", page.ids())
	}
}

func TestCanLoadMoreFilteredPhotos(t *testing.T) {
	var items []photoItem
	var want []string
	for i := 25; i >= 1; i-- {
		id := fmt.Sprintf("photo-%02d-match", i)
		items = append(items, photoWithTags(id, "france"), photoWithTags(fmt.Sprintf("photo-%02d-skip", i)))
		want = append(want, id)
	}
	app := newLibrary(true, items...)
	path := "/api/photos?tagId=france"

	first := readPage(t, testutils.Request(app, http.MethodGet, path, ""))
	if first.NextPageToken == "" {
		t.Fatal("first page has no next page token")
	}
	next := readPage(t, testutils.Request(app, http.MethodGet, path+"&pageToken="+url.QueryEscape(first.NextPageToken), ""))

	if got := append(first.ids(), next.ids()...); !slices.Equal(got, want) {
		t.Fatalf("photos = %v, want %v", got, want)
	}
}

func photoWithTags(id string, tags ...string) photoItem {
	item := photo(id, "ready", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	item.tagIDs = tags
	return item
}
