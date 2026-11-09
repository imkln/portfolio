package photos

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

const (
	uploadExpires  = 10 * time.Minute
	readExpires    = 5 * time.Minute
	photoNameField = "x-amz-meta-photo-name"
	uploads        = "uploads/"
	originals      = "originals/"
	thumbnails     = "thumbnails/"
)

type UploadForm struct {
	URL    string            `json:"url"`
	Fields map[string]string `json:"fields"`
}

type s3Store struct {
	client *s3.Client
	signer *s3.PresignClient
	bucket string
}

func NewS3Store(client *s3.Client, bucket string) *s3Store {
	return &s3Store{client: client, signer: s3.NewPresignClient(client), bucket: bucket}
}

func (store *s3Store) SignUpload(ctx context.Context, name string, size int64) (UploadForm, error) {
	key := fileKey(uploads, rand.Text())
	// Keep the signed S3 metadata field ASCII, even for non-ASCII filenames.
	encodedName := base64.RawURLEncoding.EncodeToString([]byte(name))

	form, err := store.signer.PresignPostObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(store.bucket),
		Key:    aws.String(key),
	}, func(options *s3.PresignPostOptions) {
		options.Expires = uploadExpires
		options.Conditions = []any{
			map[string]string{"Content-Type": JPEGType},
			map[string]string{photoNameField: encodedName},
			[]any{"content-length-range", size, size},
		}
	})
	if err != nil {
		return UploadForm{}, err
	}

	form.Values["Content-Type"] = JPEGType
	form.Values[photoNameField] = encodedName
	return UploadForm{URL: form.URL, Fields: form.Values}, nil
}

func (store *s3Store) OriginalURL(ctx context.Context, id string) (string, error) {
	return store.readURL(ctx, fileKey(originals, id))
}

func (store *s3Store) ThumbnailURL(ctx context.Context, id string) (string, error) {
	return store.readURL(ctx, fileKey(thumbnails, id))
}

func (store *s3Store) readURL(ctx context.Context, key string) (string, error) {
	request, err := store.signer.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket:               aws.String(store.bucket),
		Key:                  aws.String(key),
		ResponseCacheControl: aws.String("private, no-store"),
	}, s3.WithPresignExpires(readExpires))
	if err != nil {
		return "", err
	}
	return request.URL, nil
}

func (store *s3Store) DeletePhoto(ctx context.Context, id string) error {
	objects := []types.ObjectIdentifier{
		{Key: aws.String(fileKey(originals, id))},
		{Key: aws.String(fileKey(thumbnails, id))},
	}

	result, err := store.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
		Bucket: aws.String(store.bucket),
		Delete: &types.Delete{Objects: objects},
	})
	if err != nil {
		return err
	}
	if len(result.Errors) > 0 {
		return fmt.Errorf("S3 could not delete %d photo files", len(result.Errors))
	}
	return nil
}

func (store *s3Store) ReadUpload(ctx context.Context, key string) (string, []byte, error) {
	result, err := store.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(store.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return "", nil, fmt.Errorf("read uploaded JPEG: %w", err)
	}
	defer result.Body.Close()

	name, err := base64.RawURLEncoding.DecodeString(result.Metadata["photo-name"])
	if err != nil || len(name) == 0 || !utf8.Valid(name) {
		return "", nil, ErrInvalidUpload
	}
	data, err := io.ReadAll(io.LimitReader(result.Body, MaxUploadBytes+1))
	if err != nil {
		return "", nil, fmt.Errorf("read uploaded JPEG body: %w", err)
	}
	if len(data) > MaxUploadBytes {
		return "", nil, ErrInvalidUpload
	}
	return string(name), data, nil
}

func (store *s3Store) SavePhoto(ctx context.Context, id string, original, thumbnail []byte) error {
	if err := store.putJPEG(ctx, fileKey(originals, id), original); err != nil {
		return fmt.Errorf("save original: %w", err)
	}
	if err := store.putJPEG(ctx, fileKey(thumbnails, id), thumbnail); err != nil {
		return fmt.Errorf("save thumbnail: %w", err)
	}
	return nil
}

func (store *s3Store) putJPEG(ctx context.Context, key string, data []byte) error {
	_, err := store.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(store.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(JPEGType),
	})
	return err
}

func fileKey(prefix, id string) string {
	return prefix + id + ".jpg"
}

func UploadID(key string) (string, bool) {
	name, inUploads := strings.CutPrefix(key, uploads)
	id, isJPEG := strings.CutSuffix(name, ".jpg")
	return id, inUploads && isJPEG && ValidID(id)
}
