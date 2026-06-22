# Deployment Setup

Render and Vercel deploy automatically on push via their own git integrations. The GitHub Actions pipeline only runs CI checks — it does not trigger deploys.

## Branch Protection (Recommended)

Enable branch protection on `main` so that broken code cannot be merged before CI passes:

1. GitHub repo → **Settings → Branches → Add rule** for `main`
2. Enable **Require status checks to pass before merging**
3. Add `backend-checks` and `frontend-checks` as required checks

## How the Pipeline Works

```
push to main
    │
    ├── backend-checks (type-check, test)
    └── frontend-checks (type-check, lint, build)
```

Pull requests run the same checks. Nothing in the pipeline triggers a deploy — Render and Vercel handle that independently.
