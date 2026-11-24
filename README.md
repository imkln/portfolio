# Portfolio

My personal portfolio site for uploading and organizing photos with tags in a private library. It supports canvas-like editing to create and publish collections from trips.

## Editing

### Moving photos

![Moving a photo on the collection canvas](docs/images/moving-photos.gif)

### Resizing photos

![Resizing a photo on the collection canvas](docs/images/resizing-photos.gif)

### Selecting photos

![Filtering the photo picker by tags and choosing a photo](docs/images/selecting-photos.gif)

## Architecture

React and TypeScript frontend with a Go API and Worker running on AWS Lambda. Google sign-in restricts editing to the owner, and Terraform manages the infrastructure.

```mermaid
flowchart TD
    Browser["Browser"] -->|Browse and edit collections| API["API"]
    API -->|Load and save collections and tags| DB["DynamoDB"]
    API -->|Authorize photo access| Files["S3"]
    Browser -->|Upload and view photos| Files
    Files -->|Queue new uploads| Queue["SQS"]
    Queue -->|Process uploaded photo| Worker["Worker"]
    Worker -->|Save original and thumbnail| Files
    Worker -->|Match tags| AI["OpenAI"]
    Worker -->|Save tags and mark photo ready| DB
```
