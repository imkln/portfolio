package worker

import (
	"bytes"
	"context"
	"fmt"
	"image/jpeg"
	"time"

	"github.com/disintegration/imaging"
	"github.com/imkln/portfolio/src/backend/internal/shared/photos"
)

const (
	thumbnailSize  = 480
	maxPhotoPixels = 50_000_000
)

type workerStore interface {
	PhotoState(ctx context.Context, id string) (string, error)
	SaveReady(ctx context.Context, photo photos.Photo) (bool, error)
}

type workerFiles interface {
	ReadUpload(ctx context.Context, key string) (string, []byte, error)
	SavePhoto(ctx context.Context, id string, original, thumbnail []byte) error
	DeletePhoto(ctx context.Context, id string) error
}

type Worker struct {
	store workerStore
	files workerFiles
}

func New(store workerStore, files workerFiles) *Worker {
	return &Worker{store: store, files: files}
}

func (worker *Worker) Process(ctx context.Context, key string, uploadedAt time.Time) error {
	id, ok := photos.UploadID(key)
	if !ok || uploadedAt.IsZero() {
		return photos.ErrInvalidUpload
	}

	state, err := worker.store.PhotoState(ctx, id)
	if err != nil || state != "" {
		return err
	}

	name, original, err := worker.files.ReadUpload(ctx, key)
	if err != nil {
		return err
	}
	thumbnail, err := makeThumbnail(original)
	if err != nil {
		return err
	}

	if err := worker.files.SavePhoto(ctx, id, original, thumbnail); err != nil {
		return fmt.Errorf("save photo files: %w", err)
	}

	saved, err := worker.store.SaveReady(ctx, photos.Photo{ID: id, Name: name, UploadedAt: uploadedAt.UTC()})
	if err != nil || saved {
		return err
	}

	// A concurrent upload may have finished and been deleted while this one was saving.
	state, err = worker.store.PhotoState(ctx, id)
	if err == nil && (state == photos.DeletedState || state == photos.DeletingState) {
		return worker.files.DeletePhoto(ctx, id)
	}
	return err
}

func makeThumbnail(original []byte) ([]byte, error) {
	info, err := jpeg.DecodeConfig(bytes.NewReader(original))
	if err != nil || int64(info.Width)*int64(info.Height) > maxPhotoPixels {
		return nil, photos.ErrInvalidUpload
	}

	photo, err := imaging.Decode(bytes.NewReader(original), imaging.AutoOrientation(true))
	if err != nil {
		return nil, photos.ErrInvalidUpload
	}
	thumbnail := imaging.Fit(photo, thumbnailSize, thumbnailSize, imaging.Box)

	var result bytes.Buffer
	if err := jpeg.Encode(&result, thumbnail, nil); err != nil {
		return nil, fmt.Errorf("encode photo thumbnail: %w", err)
	}
	return result.Bytes(), nil
}
