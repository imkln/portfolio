package worker_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/events"

	"github.com/imkln/portfolio/src/backend/internal/domain/photos"
	workerapp "github.com/imkln/portfolio/src/backend/internal/worker"
)

const workerKey = "uploads/lake.jpg"

var uploadedAt = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

func TestWorkerAddsPhoto(t *testing.T) {
	original := jpegImage(t, 600, 400)
	worker, library := newTestWorker(t, original)

	processUpload(t, worker)

	if !bytes.Equal(library.original, original) {
		t.Fatal("the original was not saved unchanged")
	}
	if size := thumbnailDimensions(t, library.thumbnail); size != (image.Pt(480, 320)) {
		t.Fatalf("thumbnail size = %v, want 480 × 320", size)
	}
	if !library.ready || library.photo.ID != "lake" || library.photo.Name != "lake.jpg" || !library.photo.UploadedAt.Equal(uploadedAt) {
		t.Fatalf("published photo = %+v, want lake.jpg ready at %s", library.photo, uploadedAt)
	}
}

func TestWorkerRejectsInvalidJPEG(t *testing.T) {
	worker, library := newTestWorker(t, []byte("invalid JPEG"))

	err := worker.Process(t.Context(), workerKey, uploadedAt)

	if !errors.Is(err, photos.ErrInvalidUpload) {
		t.Fatalf("error = %v, want an invalid upload error", err)
	}
	if library.ready || len(library.original) != 0 || len(library.thumbnail) != 0 {
		t.Fatal("the worker saved an invalid JPEG")
	}
}

func TestWorkerHidesPhotoIfSaveFails(t *testing.T) {
	worker, library := newTestWorker(t, jpegImage(t, 600, 400))
	library.saveError = errors.New("could not save the thumbnail")

	err := worker.Process(t.Context(), workerKey, uploadedAt)

	if !errors.Is(err, library.saveError) {
		t.Fatalf("error = %v, want the thumbnail save error", err)
	}
	if library.ready {
		t.Fatal("the photo appeared in the library before its thumbnail was saved")
	}
}

func TestUploadReplayPreservesPublishedAndDeletedPhotos(t *testing.T) {
	worker, library := newTestWorker(t, jpegImage(t, 600, 400))

	const bucket = "test-photos"
	UploadReplay(t, bucket, workerKey, uploadedAt, func(message []byte) {
		var event events.SQSEvent
		if err := json.Unmarshal(message, &event); err != nil {
			t.Fatal(err)
		}
		if err := worker.ProcessUploadEvent(t.Context(), bucket, event); err != nil {
			t.Fatal(err)
		}
	}, func() PublishedPhoto {
		return PublishedPhoto{
			Ready: library.ready, ID: library.photo.ID, Name: library.photo.Name,
			UploadedAt: library.photo.UploadedAt, Original: library.original, Thumbnail: library.thumbnail,
		}
	}, func() {
		library.ready = false
		library.deleted = true
		library.original, library.thumbnail = nil, nil
	})
}

func TestThumbnailKeepsPhotoOrientation(t *testing.T) {
	original := portraitJPEG(jpegImage(t, 600, 400))
	worker, library := newTestWorker(t, original)

	processUpload(t, worker)

	if size := thumbnailDimensions(t, library.thumbnail); size != (image.Pt(320, 480)) {
		t.Fatalf("thumbnail size = %v, want 320 × 480", size)
	}
}

func jpegImage(t *testing.T, width, height int) []byte {
	t.Helper()

	var file bytes.Buffer
	if err := jpeg.Encode(&file, image.NewGray(image.Rect(0, 0, width, height)), nil); err != nil {
		t.Fatalf("create test JPEG: %v", err)
	}
	return file.Bytes()
}

func portraitJPEG(landscape []byte) []byte {
	// EXIF orientation 6 means rotate the stored landscape image 90° clockwise.
	exif := []byte{
		0xff, 0xe1, 0x00, 0x22, 'E', 'x', 'i', 'f', 0, 0,
		'I', 'I', 42, 0, 8, 0, 0, 0,
		1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0,
		0, 0, 0, 0,
	}
	portrait := append([]byte{0xff, 0xd8}, exif...)
	return append(portrait, landscape[2:]...)
}

func thumbnailDimensions(t *testing.T, thumbnail []byte) image.Point {
	t.Helper()

	info, err := jpeg.DecodeConfig(bytes.NewReader(thumbnail))
	if err != nil {
		t.Fatalf("read saved thumbnail: %v", err)
	}
	return image.Pt(info.Width, info.Height)
}

func newTestWorker(t *testing.T, original []byte) (*workerapp.Worker, *workerLibrary) {
	t.Helper()

	library := &workerLibrary{upload: original}
	return workerapp.New(library, library), library
}

func processUpload(t *testing.T, worker *workerapp.Worker) {
	t.Helper()

	if err := worker.Process(t.Context(), workerKey, uploadedAt); err != nil {
		t.Fatalf("process upload: %v", err)
	}
}

type workerLibrary struct {
	upload    []byte
	original  []byte
	thumbnail []byte
	ready     bool
	deleted   bool
	photo     photos.Photo
	saveError error
}

func (library *workerLibrary) PhotoState(_ context.Context, id string) (string, error) {
	if id != "lake" {
		return "", errors.New("unexpected photo ID")
	}
	if library.deleted {
		return "deleted", nil
	}
	if library.ready {
		return "ready", nil
	}
	return "", nil
}

func (library *workerLibrary) SaveReady(_ context.Context, photo photos.Photo) (bool, error) {
	if len(library.original) == 0 || len(library.thumbnail) == 0 {
		return false, errors.New("the photo was marked ready before both files were saved")
	}
	if library.ready || library.deleted {
		return false, nil
	}

	library.ready = true
	library.photo = photo
	return true, nil
}

func (library *workerLibrary) ReadUpload(_ context.Context, key string) (string, []byte, error) {
	if key != workerKey {
		return "", nil, errors.New("unexpected upload key")
	}
	return "lake.jpg", library.upload, nil
}

func (library *workerLibrary) SavePhoto(_ context.Context, id string, original, thumbnail []byte) error {
	if id != "lake" {
		return errors.New("unexpected photo ID")
	}
	library.original = original
	if library.saveError != nil {
		return library.saveError
	}
	library.thumbnail = thumbnail
	return nil
}

func (library *workerLibrary) DeletePhoto(_ context.Context, id string) error {
	if id != "lake" {
		return errors.New("unexpected photo ID")
	}
	library.original, library.thumbnail = nil, nil
	return nil
}
