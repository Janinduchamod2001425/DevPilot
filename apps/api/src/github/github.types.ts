export type GitHubInstallationResponse = {
  id: number;
  repository_selection: string;
  suspended_at: string | null;
  account: {
    id: number;
    login: string;
    type: "User" | "Organization";
    avatar_url: string | null;
  };
};

export type GitHubInstallationTokenResponse = {
  token: string;
  expires_at: string;
};

export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  default_branch: string;
  owner: {
    id: number;
    login: string;
    avatar_url: string | null;
  };
};

export type GitHubRepositoriesResponse = {
  total_count: number;
  repositories: GitHubRepository[];
};
