package photos

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

const (
	uploadExpires  = 10 * time.Minute
	readExpires    = 5 * time.Minute
	photoNameField = "x-amz-meta-photo-name"
	originals      = "originals/"
	thumbnails     = "thumbnails/"
)

type s3Store struct {
	client *s3.Client
	signer *s3.PresignClient
	bucket string
}

func NewS3Store(client *s3.Client, bucket string) *s3Store {
	return &s3Store{client: client, signer: s3.NewPresignClient(client), bucket: bucket}
}

func (store *s3Store) SignUpload(ctx context.Context, name string, size int64) (UploadForm, error) {
	key := "uploads/" + rand.Text() + ".jpg"
	// Keep the signed S3 metadata field ASCII, even for non-ASCII filenames.
	encodedName := base64.RawURLEncoding.EncodeToString([]byte(name))

	form, err := store.signer.PresignPostObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(store.bucket),
		Key:    aws.String(key),
	}, func(options *s3.PresignPostOptions) {
		options.Expires = uploadExpires
		options.Conditions = []any{
			map[string]string{"Content-Type": jpegType},
			map[string]string{photoNameField: encodedName},
			[]any{"content-length-range", size, size},
		}
	})
	if err != nil {
		return UploadForm{}, err
	}

	form.Values["Content-Type"] = jpegType
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

func fileKey(prefix, id string) string {
	return prefix + id + ".jpg"
}
