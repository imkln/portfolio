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
