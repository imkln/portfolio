package worker_test

import (
	"bytes"
	"fmt"
	"testing"
	"time"
)

type PublishedPhoto struct {
	Ready               bool
	ID, Name            string
	UploadedAt          time.Time
	Original, Thumbnail []byte
}

func UploadReplay(t *testing.T, bucket, key string, uploadedAt time.Time, deliver func([]byte), read func() PublishedPhoto, deletePhoto func()) {
	t.Helper()

	upload := fmt.Sprintf(`{"Records":[{"eventTime":%q,"s3":{"bucket":{"name":%q},"object":{"key":%q}}}]}`,
		uploadedAt.UTC().Format(time.RFC3339Nano), bucket, key)
	message := []byte(fmt.Sprintf(`{"Records":[{"body":%q}]}`, upload))
	deliver(message)
	before := read()
	if !before.Ready || len(before.Original) == 0 || len(before.Thumbnail) == 0 {
		t.Fatal("first delivery did not publish the photo and both files")
	}
	before.Original = bytes.Clone(before.Original)
	before.Thumbnail = bytes.Clone(before.Thumbnail)

	deliver(message)
	after := read()
	if !after.Ready || after.ID != before.ID || after.Name != before.Name ||
		!after.UploadedAt.Equal(before.UploadedAt) ||
		!bytes.Equal(after.Original, before.Original) || !bytes.Equal(after.Thumbnail, before.Thumbnail) {
		t.Fatal("duplicate delivery changed the published photo")
	}

	deletePhoto()
	deliver(message)
	after = read()
	if after.Ready || len(after.Original) != 0 || len(after.Thumbnail) != 0 {
		t.Fatal("late delivery restored a deleted photo")
	}
}
