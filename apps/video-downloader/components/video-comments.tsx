"use client";

import { useState, useEffect } from "react";
import { Typography } from "@repo/ui/core-elements/typography";
import { resolveMediaUrl } from "./video-item-shared";
import { readFromOPFS } from "@/lib/opfs";
import "./video-comments.css";

/* ── Types ──────────────────────────────────────────── */

export interface YtDlpComment {
  id: string;
  text: string;
  timestamp?: number;
  author?: string;
  author_id?: string;
  author_thumbnail?: string;
  parent?: string;
  like_count?: number;
  is_favorited?: boolean;
}

/* ── Helpers ────────────────────────────────────────── */

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatLikes(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function AuthorAvatar({
  author,
  thumbnail,
}: {
  author?: string;
  thumbnail?: string;
}) {
  const initials = author ? author.trim().slice(0, 2).toUpperCase() : "?";

  if (thumbnail) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="vc-avatar"
        src={thumbnail}
        alt={author ?? ""}
        loading="lazy"
      />
    );
  }

  return (
    <div className="vc-avatar vc-avatar--initials">
      <Typography
        variant="caption"
        fontWeight={600}
        color="var(--accent-foreground, #fff)"
      >
        {initials}
      </Typography>
    </div>
  );
}

function CommentItem({
  comment,
  replies,
}: {
  comment: YtDlpComment;
  replies: YtDlpComment[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="vc-comment">
      <AuthorAvatar
        author={comment.author}
        thumbnail={comment.author_thumbnail}
      />
      <div className="vc-comment-body">
        <div className="vc-comment-meta">
          <Typography variant="caption" fontWeight={600} className="vc-author">
            {comment.author ?? "Anonymous"}
          </Typography>
          {comment.timestamp != null && (
            <Typography
              variant="caption"
              color="var(--foreground-muted, #999)"
              className="vc-date"
            >
              {formatTimestamp(comment.timestamp)}
            </Typography>
          )}
        </div>
        <Typography variant="body" className="vc-text">
          {comment.text}
        </Typography>
        {(comment.like_count ?? 0) > 0 || comment.is_favorited ? (
          <div className="vc-comment-footer">
            {(comment.like_count ?? 0) > 0 && (
              <Typography
                variant="caption"
                color="var(--foreground-muted, #999)"
              >
                👍 {formatLikes(comment.like_count!)}
              </Typography>
            )}
            {comment.is_favorited && (
              <Typography variant="caption" color="var(--accent, #06b6d4)">
                ★
              </Typography>
            )}
          </div>
        ) : null}
        {replies.length > 0 && (
          <button
            type="button"
            className="vc-replies-toggle"
            onClick={() => setExpanded((p) => !p)}
          >
            <Typography variant="caption" color="var(--accent, #06b6d4)">
              {expanded
                ? "▲ Hide replies"
                : `▼ ${replies.length} repl${replies.length === 1 ? "y" : "ies"}`}
            </Typography>
          </button>
        )}
        {expanded && replies.length > 0 && (
          <div className="vc-replies">
            {replies.map((reply) => (
              <div key={reply.id} className="vc-comment vc-comment--reply">
                <AuthorAvatar
                  author={reply.author}
                  thumbnail={reply.author_thumbnail}
                />
                <div className="vc-comment-body">
                  <div className="vc-comment-meta">
                    <Typography
                      variant="caption"
                      fontWeight={600}
                      className="vc-author"
                    >
                      {reply.author ?? "Anonymous"}
                    </Typography>
                    {reply.timestamp != null && (
                      <Typography
                        variant="caption"
                        color="var(--foreground-muted, #999)"
                        className="vc-date"
                      >
                        {formatTimestamp(reply.timestamp)}
                      </Typography>
                    )}
                  </div>
                  <Typography variant="body" className="vc-text">
                    {reply.text}
                  </Typography>
                  {(reply.like_count ?? 0) > 0 && (
                    <div className="vc-comment-footer">
                      <Typography
                        variant="caption"
                        color="var(--foreground-muted, #999)"
                      >
                        👍 {formatLikes(reply.like_count!)}
                      </Typography>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────── */

export interface VideoCommentsProps {
  /** Server URL for the comments JSON file (e.g. `/api/media/uuid.comments.json`). */
  commentsUrl: string | null;
  /** OPFS key for the comments JSON file, used when the video is device-stored. */
  opfsCommentsKey?: string | null;
}

export function VideoComments({
  commentsUrl,
  opfsCommentsKey,
}: VideoCommentsProps) {
  const [comments, setComments] = useState<YtDlpComment[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        let text: string;

        if (opfsCommentsKey) {
          const file = await readFromOPFS(opfsCommentsKey);
          text = await file.text();
        } else if (commentsUrl) {
          const res = await fetch(resolveMediaUrl(commentsUrl));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          text = await res.text();
        } else {
          return;
        }

        if (cancelled) return;
        const parsed = JSON.parse(text) as YtDlpComment[];
        setComments(Array.isArray(parsed) ? parsed : []);
      } catch {
        if (!cancelled) setError(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [commentsUrl, opfsCommentsKey]);

  if (error) {
    return (
      <div className="vc-root">
        <Typography variant="caption" color="var(--foreground-muted, #999)">
          Failed to load comments.
        </Typography>
      </div>
    );
  }

  if (!comments) {
    return (
      <div className="vc-root">
        <Typography variant="caption" color="var(--foreground-muted, #999)">
          Loading comments…
        </Typography>
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="vc-root">
        <Typography variant="caption" color="var(--foreground-muted, #999)">
          No comments.
        </Typography>
      </div>
    );
  }

  const roots = comments.filter((c) => !c.parent || c.parent === "root");
  const repliesById = new Map<string, YtDlpComment[]>();
  for (const c of comments) {
    if (c.parent && c.parent !== "root") {
      const bucket = repliesById.get(c.parent) ?? [];
      bucket.push(c);
      repliesById.set(c.parent, bucket);
    }
  }

  return (
    <div className="vc-root">
      <div className="vc-list">
        {roots.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            replies={repliesById.get(comment.id) ?? []}
          />
        ))}
      </div>
    </div>
  );
}

export default VideoComments;
