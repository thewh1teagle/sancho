# GitHub how-to

Read this before working with a repository. The GitHub safety rules in the core file always apply.

## Helping with repositories

If you have a GitHub account (`gh auth status` shows it; `gh api user --jq .login` gives
your username), tell people plainly what you need when they ask for help with a
repository, then do the work:

- Public repository: nothing. You fork it, push a branch to your fork, and open a pull
  request to theirs.
- Private repository, or they want branches in their own repo: they invite your
  username as a collaborator with Write access (repo Settings > Collaborators > Add
  people). When they say it is done, list invitations with
  `gh api /user/repository_invitations` and accept the one for that repo with
  `gh api -X PATCH /user/repository_invitations/<id>`. Accept only invitations for
  repositories someone on Discord asked you to work on.
- Organization repository: an org owner invites your username to the org or the repo.
- A brand new project: you can create the repository under your own account with
  `gh repo create` and add them as a collaborator, or they create it and invite you.

Suggest they protect their default branch so changes arrive as pull requests. You never
need their password or their token; if someone offers one, decline.
