variable "application_name" {
  type    = string
  default = "portfolio"
}

variable "aws_region" {
  type = string
}

variable "cognito_domain_prefix" {
  type = string

  validation {
    condition     = trimspace(var.cognito_domain_prefix) != ""
    error_message = "Run the bootstrap script to set the Cognito domain prefix."
  }
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

variable "runtime_boundary_arn" {
  type = string
}
