import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "batch-prompt-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const BATCH_DIR = path.resolve(path.dirname(process.argv[1]), '..', '..', '..');

function runGit(repoDir, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: repoDir, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('error', reject);
    child.on('close', code => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code }));
  });
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_branch_worktree",
      description: "Create a git branch and corresponding worktree, and copy project opencode config into the worktree. Auto-detects default branch (main > master > dev). Worktree path is auto-computed as: {repoParentDir}\\worktrees\\{repoName}\\{worktreeName}\\{repoName} where worktreeName = branch with / replaced by -",
      inputSchema: {
        type: "object",
        properties: {
          repoDir: { type: "string", description: "Full path to the git repository" },
          branch: { type: "string", description: "Branch name to create (e.g. feat/add-user-form)" }
        },
        required: ["repoDir", "branch"]
      }
    }
  ]
}));

function setupWorktreeDir(worktreePath) {
  const resolvedPath = path.resolve(worktreePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new McpError(ErrorCode.InvalidParams,
      `Directory does not exist: ${worktreePath} (resolved: ${resolvedPath})`);
  }

  const src = path.join(BATCH_DIR, 'project-opencode.json');
  const dest = path.join(resolvedPath, 'opencode.json');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }

  function copyDir(srcDir, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir)) {
      const s = path.join(srcDir, entry);
      const d = path.join(destDir, entry);
      if (fs.statSync(s).isDirectory()) {
        copyDir(s, d);
      } else {
        fs.copyFileSync(s, d);
      }
    }
  }

  const opencodeSrc = path.join(BATCH_DIR, '.opencode');
  const opencodeDest = path.join(resolvedPath, '.opencode');
  if (fs.existsSync(opencodeSrc)) {
    copyDir(opencodeSrc, opencodeDest);
  }

  return resolvedPath;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "create_branch_worktree") {
    const { repoDir, branch } = args;
    if (!repoDir || !branch) {
      throw new McpError(ErrorCode.InvalidParams, "repoDir and branch are required");
    }

    const parentDir = path.dirname(repoDir);
    const repoName = path.basename(repoDir);
    const worktreeName = branch.replace(/\//g, '-');
    const worktreeDir = path.join(parentDir, 'worktrees', repoName, worktreeName, repoName);

    let r;

    r = await runGit(repoDir, ['rev-parse', '--git-dir']);
    if (r.code !== 0) {
      throw new McpError(ErrorCode.InternalError, `Not a git repository: ${repoDir}`);
    }

    r = await runGit(repoDir, ['symbolic-ref', 'refs/remotes/origin/HEAD']);
    let defaultBranch = null;
    const match = r.stdout.match(/origin\/(.+)/);
    if (match) defaultBranch = match[1].trim();

    if (!defaultBranch && r.code !== 0) {
      r = await runGit(repoDir, ['remote', 'show', 'origin']);
      const m = r.stdout.match(/HEAD branch:\s*(.+)/);
      if (m) defaultBranch = m[1].trim();
    }

    if (!defaultBranch) {
      throw new McpError(ErrorCode.InternalError, 'Could not detect default branch from remote');
    }

    r = await runGit(repoDir, ['branch', '--list', branch]);
    const branchExists = r.stdout.trim().length > 0;

    if (branchExists) {
      r = await runGit(repoDir, ['worktree', 'add', worktreeDir, branch]);
    } else {
      r = await runGit(repoDir, ['worktree', 'add', '-b', branch, worktreeDir, defaultBranch]);
    }
    if (r.code !== 0) {
      throw new McpError(ErrorCode.InternalError,
        `git worktree add failed:\n${r.stdout || r.stderr}`);
    }

    // Copy project opencode config into the worktree
    setupWorktreeDir(worktreeDir);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ worktreePath: worktreeDir, branch })
      }]
    };
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
