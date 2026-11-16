package worker

import (
	"bytes"
	"context"
	"fmt"
	"image/jpeg"
	"log/slog"
	"slices"
	"strings"
	"time"
	"unicode"

	"github.com/disintegration/imaging"
	"github.com/imkln/portfolio/src/backend/internal/api/tags"
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

type tagCatalog interface {
	List(context.Context) ([]tags.Tag, error)
}

type tagMatcher interface {
	Match(context.Context, []byte, []Candidate) ([]string, error)
}

type Worker struct {
	store   workerStore
	files   workerFiles
	catalog tagCatalog
	matcher tagMatcher
}

func New(store workerStore, files workerFiles, catalog tagCatalog, matcher tagMatcher) *Worker {
	return &Worker{store: store, files: files, catalog: catalog, matcher: matcher}
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

	catalog, err := worker.catalog.List(ctx)
	if err != nil {
		return err
	}
	candidates := eligibleTags(catalog)

	if err := worker.files.SavePhoto(ctx, id, original, thumbnail); err != nil {
		return fmt.Errorf("save photo files: %w", err)
	}

	photo := photos.Photo{ID: id, Name: name, UploadedAt: uploadedAt.UTC()}
	if len(candidates) > 0 {
		matches, err := worker.matcher.Match(ctx, thumbnail, candidates)
		if err != nil {
			slog.WarnContext(ctx, "automatic photo tagging failed", "error", err)
		} else {
			for _, candidate := range candidates {
				if slices.Contains(matches, candidate.ID) {
					photo.TagIDs = append(photo.TagIDs, candidate.ID)
				}
			}
		}
	}

	saved, err := worker.store.SaveReady(ctx, photo)
	if err != nil || saved {
		return err
	}

	return worker.cleanUpDeletedPhoto(ctx, id)
}

// A concurrent upload may have finished and been deleted while this one was saving.
func (worker *Worker) cleanUpDeletedPhoto(ctx context.Context, id string) error {
	state, err := worker.store.PhotoState(ctx, id)
	if err == nil && (state == photos.DeletedState || state == photos.DeletingState) {
		return worker.files.DeletePhoto(ctx, id)
	}
	return err
}

func eligibleTags(catalog []tags.Tag) []Candidate {
	var eligible []tags.Tag
	for _, tag := range catalog {
		if tag.AutoApply {
			eligible = append(eligible, tag)
		}
	}
	counts := make(map[string]int, len(eligible))
	for _, tag := range eligible {
		counts[foldName(tag.Name)]++
	}
	var candidates []Candidate
	for _, tag := range eligible {
		if counts[foldName(tag.Name)] == 1 {
			candidates = append(candidates, Candidate{ID: tag.ID, Name: tag.Name})
		}
	}
	return candidates
}

func foldName(name string) string {
	// Pick the same representative for every rune in a Unicode simple-fold cycle.
	return strings.Map(func(r rune) rune {
		minimum := r
		for next := unicode.SimpleFold(r); next != r; next = unicode.SimpleFold(next) {
			minimum = min(minimum, next)
		}
		return minimum
	}, name)
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
