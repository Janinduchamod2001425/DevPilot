import { createPrismaClient } from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error(
        "DATABASE_URL is required to seed the database",
    );
}

const repositoryUrl =
    process.env.DEV_SEED_REPOSITORY_URL;

if (!repositoryUrl) {
    throw new Error(
        "DEV_SEED_REPOSITORY_URL is required",
    );
}

const repositoryBranch =
    process.env.DEV_SEED_REPOSITORY_BRANCH ?? "main";

function parseGitHubRepository(url: string): {
    owner: string;
    name: string;
} {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname
        .split("/")
        .filter(Boolean);

    if (
        parsedUrl.hostname !== "github.com" ||
        segments.length < 2
    ) {
        throw new Error(
            "DEV_SEED_REPOSITORY_URL must be a valid GitHub repository URL",
        );
    }

    return {
        owner: segments[0],
        name: segments[1].replace(/\.git$/, ""),
    };
}

const repository = parseGitHubRepository(
    repositoryUrl,
);

const prisma = createPrismaClient(databaseUrl);

async function seed(): Promise<void> {
    const user = await prisma.user.upsert({
        where: {
            githubId: "dev-local-user",
        },

        update: {
            username: "janindu-dev",
            displayName: "Janindu Chamod",
        },

        create: {
            githubId: "dev-local-user",
            username: "janindu-dev",
            displayName: "Janindu Chamod",
        },
    });

    const project = await prisma.project.upsert({
        where: {
            slug: "devpilot-test-project",
        },

        update: {
            repositoryOwner: repository.owner,
            repositoryName: repository.name,
            repositoryUrl,
            productionBranch: repositoryBranch,
        },

        create: {
            name: "DevPilot Test Project",
            slug: "devpilot-test-project",
            repositoryOwner: repository.owner,
            repositoryName: repository.name,
            repositoryUrl,
            productionBranch: repositoryBranch,
            userId: user.id,
        },
    });

    console.log("Development seed completed");
    console.log(`User ID: ${user.id}`);
    console.log(`Project ID: ${project.id}`);
    console.log(`Repository: ${project.repositoryUrl}`);
}

seed()
    .catch((error: unknown) => {
        console.error("Development seed failed", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });