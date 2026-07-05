#!/bin/bash

set -e

# Update all installed plugin marketplaces from their sources.
# No name = update every marketplace.
claude plugin marketplace update
