# Example Usage

This directory demonstrates how to use the `envoke` package in a standalone project.

## Setup

```bash
# Install `envoke` globally
npm install -g @takken/envoke

# Or run locally
npx @takken/envoke @scripts/hello.ts 1 2 --name test --verbose
```

The tsconfig.json in this directory defines path mappings that `envoke` will use to resolve `@scripts/*` to `./scripts/*`.
