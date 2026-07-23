# Envoke

A simple script runner.

---

Smooths out script running. Hear me out:

### Simplify paths 

By allowing tsconfig path mappings when calling scripts

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@scripts/*": ["tools/scripts/*"]
    }
  }
}
```

```diff
// package.json
{
  "scripts": {
-   "test": "tsx ./tools/scripts/app/test.ts",
+   "test": "envoke @scripts/app/test",
  }
}
```

Then run it (use --verbose while debugging)

![img.png](example/example-debug-output.png)

### Support monorepos

Will keep track of the execution context as well as the root of the repository.

The following "just works".

```diff
- "build": "run -T tsx ../../tools/scripts/app/test.ts",
+ "build": "run -T envoke @scripts/app/test",
```

### Preserves env vars

Environment variables are automatically passed through to the child process.

```diff
- "build": "ENV=production tsx ./tools/scripts/app/build-web.ts",
+ "build": "ENV=production envoke @scripts/app/build-web",
```

### Loads .env files

Reads `.env` files (via [dotenv](https://www.npmjs.com/package/dotenv)) before
running your script, from both the repository root and the current working
directory (deduplicated when they are the same). Missing files are ignored.

Real environment variables are **never** overwritten. Sources are applied in
this order:

| Precedence (highest first) | Source |
| --- | --- |
| 1 | Real environment variables |
| 2 | `NODE_ENV` from `--production` / `--development` |
| 3 | Current working directory `.env*` files |
| 4 | Repository root `.env*` files |

Within a single directory the layers are `.env.[mode].local` > `.env.[mode]` >
`.env.local` > `.env`. Mode files (e.g. `.env.production`) are only loaded when
`NODE_ENV` is known, from the environment or a flag.

Use `--verbose` to see which files were loaded (paths only, never values).

### Sets NODE_ENV

Pass `--production` or `--development` to set `NODE_ENV` for your script.

```diff
- "build": "NODE_ENV=production tsx ./tools/scripts/app/build-web.ts",
+ "build": "envoke @scripts/app/build-web --production",
```

An explicit flag wins over an inherited `NODE_ENV`. Passing both `--production`
and `--development` is an error.

Everything after a literal `--` is passed to your script untouched, so envoke
never interprets your script's own flags:

```bash
envoke @scripts/app/serve -- --production --port 3000
```

### Supports CI

Works great in CI environments, where you might use `actions/github-script` or scall scripts directly.

```diff
      - name: Update PR comment with deployment info
-       run: yarn tsx tools/scripts/ci/update-pr-comment.ts
+       run: yarn envoke @scripts/ci/update-pr-comment
        env:
          CI: true
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: ${{ github.repository }}
          GITHUB_PR_NUMBER: ${{ github.event.pull_request.number }}
```

## Setup

Install it

```bash
npm install --save-dev @takken/envoke
# or
yarn add -D @takken/envoke
# or
pnpm add -D @takken/envoke
# or 
bun add -d @takken/envoke
```

Create a test script:

```ts
// ./scripts/hello.ts
console.log("Hello, world!");
console.log("Args:", process.argv.slice(2));
console.log("Env:", process.env);
```

Add a path mapping in your tsconfig.json:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@scripts/*": ["./scripts/*"]
    }
  }
}
```

Then try it

```bash
npx envoke @scripts/hello --verbose
# or
yarn envoke @scripts/hello --verbose
# or
pnpm envoke @scripts/hello --verbose
# or
bun run envoke @scripts/hello --verbose
```

## License

This package is [MIT](./LICENSE) licensed.
