variable "application_name" {
  type    = string
  default = "portfolio"
}

variable "aws_region" {
  type = string
}

variable "google_client_id" {
  type = string

  validation {
    condition     = trimspace(var.google_client_id) != ""
    error_message = "Set the Google OAuth client ID."
  }
}

variable "google_client_secret" {
  type      = string
  sensitive = true

  validation {
    condition     = trimspace(var.google_client_secret) != ""
    error_message = "Set the Google OAuth client secret."
  }
}

variable "owner_email" {
  type      = string
  sensitive = true

  validation {
    condition     = trimspace(var.owner_email) != ""
    error_message = "Set the owner email."
  }
}

variable "openai_secret_arn" {
  type = string

  validation {
    condition     = can(regex("^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+$", var.openai_secret_arn))
    error_message = "Set the ARN of the Secrets Manager secret containing the OpenAI API key."
  }
}
