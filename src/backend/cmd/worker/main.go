package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	photodb "github.com/imkln/portfolio/src/backend/internal/infra/persistence/photos"
	photofiles "github.com/imkln/portfolio/src/backend/internal/infra/storage/photos"
	"github.com/imkln/portfolio/src/backend/internal/worker"
)

func main() {
	bucket := os.Getenv("PHOTO_UPLOAD_BUCKET")
	table := os.Getenv("PHOTOS_TABLE")
	if bucket == "" || table == "" {
		slog.Error("PHOTO_UPLOAD_BUCKET and PHOTOS_TABLE are required")
		os.Exit(1)
	}

	awsConfig, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		slog.Error("load AWS configuration", "error", err)
		os.Exit(1)
	}

	store := photodb.NewDynamoStore(dynamodb.NewFromConfig(awsConfig), table)
	files := photofiles.NewS3Store(s3.NewFromConfig(awsConfig), bucket)
	processor := worker.New(store, files)

	lambda.Start(func(ctx context.Context, event events.SQSEvent) error {
		return processor.ProcessUploadEvent(ctx, bucket, event)
	})
}
