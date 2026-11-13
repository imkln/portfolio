package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/awslabs/aws-lambda-go-api-proxy/httpadapter"
	"github.com/imkln/portfolio/src/backend/internal/api/auth"
	"github.com/imkln/portfolio/src/backend/internal/api/collections"
	"github.com/imkln/portfolio/src/backend/internal/api/server"
	"github.com/imkln/portfolio/src/backend/internal/api/tags"
	"github.com/imkln/portfolio/src/backend/internal/shared/photos"
)

func main() {
	assets := flag.String("assets", "src/frontend/dist", "frontend build directory")
	flag.Parse()

	if os.Getenv("AWS_LAMBDA_RUNTIME_API") != "" {
		*assets = "web"
	}

	appConfig := auth.Config{
		Origin:       os.Getenv("APP_ORIGIN"),
		Issuer:       os.Getenv("OIDC_ISSUER"),
		ClientID:     os.Getenv("OIDC_CLIENT_ID"),
		AuthDomain:   os.Getenv("AUTH_DOMAIN"),
		OwnerEmail:   os.Getenv("OWNER_EMAIL"),
		OwnerSubject: os.Getenv("OWNER_SUBJECT"),
		CookieKey:    os.Getenv("COOKIE_KEY"),
	}

	collectionsTable := os.Getenv("COLLECTIONS_TABLE")
	if collectionsTable == "" {
		slog.Error("COLLECTIONS_TABLE is required")
		os.Exit(1)
	}

	photosTable := os.Getenv("PHOTOS_TABLE")
	if photosTable == "" {
		slog.Error("PHOTOS_TABLE is required")
		os.Exit(1)
	}

	uploadBucket := os.Getenv("PHOTO_UPLOAD_BUCKET")
	if uploadBucket == "" {
		slog.Error("PHOTO_UPLOAD_BUCKET is required")
		os.Exit(1)
	}

	ctx := context.Background()
	awsConfig, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		slog.Error("load AWS configuration", "error", err)
		os.Exit(1)
	}

	dynamoClient := dynamodb.NewFromConfig(awsConfig)
	collectionStore := collections.NewDynamoStore(dynamoClient, collectionsTable)
	photoStore := photos.NewDynamoStore(dynamoClient, photosTable)
	tagStore := tags.NewDynamoStore(dynamoClient, collectionsTable)
	photoFiles := photos.NewS3Store(s3.NewFromConfig(awsConfig), uploadBucket)
	handler, err := server.New(
		ctx, appConfig, os.DirFS(*assets), collectionStore, photoStore, tagStore,
		photoFiles, os.Getenv("PHOTO_UPLOAD_ORIGIN"),
	)
	if err != nil {
		slog.Error("startup failed", "error", err)
		os.Exit(1)
	}

	if os.Getenv("AWS_LAMBDA_RUNTIME_API") != "" {
		lambda.Start(httpadapter.NewV2(handler).ProxyWithContext)
		return
	}

	server := &http.Server{
		Addr:              "localhost:8080",
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       time.Minute,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()

		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := server.Shutdown(shutdown); err != nil {
			slog.Error("shutdown failed", "error", err)
		}
	}()

	slog.Info("listening", "url", "http://localhost:8080")
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}
