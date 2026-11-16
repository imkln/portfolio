package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	"github.com/imkln/portfolio/src/backend/internal/api/tags"
	"github.com/imkln/portfolio/src/backend/internal/shared/photos"
	"github.com/imkln/portfolio/src/backend/internal/worker"
)

func main() {
	bucket := os.Getenv("PHOTO_UPLOAD_BUCKET")
	table := os.Getenv("PHOTOS_TABLE")
	secretID := os.Getenv("OPENAI_SECRET_ARN")
	if bucket == "" || table == "" || secretID == "" {
		slog.Error("PHOTO_UPLOAD_BUCKET, PHOTOS_TABLE and OPENAI_SECRET_ARN are required")
		os.Exit(1)
	}

	awsConfig, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		slog.Error("load AWS configuration", "error", err)
		os.Exit(1)
	}

	secretContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	secret, err := secretsmanager.NewFromConfig(awsConfig).GetSecretValue(secretContext, &secretsmanager.GetSecretValueInput{
		SecretId: aws.String(secretID),
	})
	cancel()
	if err != nil {
		slog.Error("could not read the automatic tagging credential")
		os.Exit(1)
	}
	key := strings.TrimSpace(aws.ToString(secret.SecretString))
	if key == "" {
		slog.Error("the automatic tagging credential is empty")
		os.Exit(1)
	}

	dynamo := dynamodb.NewFromConfig(awsConfig)
	store := photos.NewDynamoStore(dynamo, table)
	files := photos.NewS3Store(s3.NewFromConfig(awsConfig), bucket)
	processor := worker.New(store, files, tags.NewDynamoStore(dynamo, table), worker.NewOpenAI(key))

	lambda.Start(func(ctx context.Context, event events.SQSEvent) error {
		for _, message := range event.Records {
			var upload events.S3Event
			if err := json.Unmarshal([]byte(message.Body), &upload); err != nil {
				return fmt.Errorf("read S3 upload event: %w", err)
			}

			for _, record := range upload.Records {
				if record.S3.Bucket.Name != bucket {
					continue
				}

				err := processor.Process(ctx, record.S3.Object.URLDecodedKey, record.EventTime)
				if errors.Is(err, photos.ErrInvalidUpload) {
					slog.WarnContext(ctx, "ignored invalid photo upload")
					continue
				}
				if err != nil {
					return err
				}
			}
		}
		return nil
	})
}
