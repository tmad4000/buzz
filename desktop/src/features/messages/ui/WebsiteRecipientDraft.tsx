import * as React from "react";

import { useManagedAgentsQuery } from "@/features/agents/hooks";
import { relayAgentIsSharedWithUser } from "@/features/agents/lib/agentAutocompleteEligibility";
import { useChannelsQuery } from "@/features/channels/hooks";
import { invokeTauri } from "@/shared/api/tauri";
import { revalidateRelayAgents } from "@/shared/api/tauriRelayAgents";
import { Button } from "@/shared/ui/button";

import {
  privatePageQuestion,
  verifyWebsiteContact,
  type WebsiteContact,
  type WebsiteDraft,
  websiteMessage,
} from "../lib/websiteRecipient";

type Page = { url: string; text: string };

export function WebsiteRecipientDraft({
  draft,
  sender,
  relayUrl,
  send,
}: {
  draft: WebsiteDraft;
  sender: string;
  relayUrl: string;
  send: (
    recipient: string,
    content: string,
    stillCurrent: () => boolean,
  ) => Promise<void>;
}) {
  const [mode, setMode] = React.useState<"private" | "official" | null>(null);
  const [page, setPage] = React.useState<Page | null>(null);
  const [contact, setContact] = React.useState<WebsiteContact | null>(null);
  const [recipientName, setRecipientName] = React.useState("");
  const [agentKey, setAgentKey] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [pastedText, setPastedText] = React.useState("");
  const [includePath, setIncludePath] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const operation = React.useRef<object | null>(null);
  React.useLayoutEffect(
    () => () => {
      operation.current = null;
    },
    [],
  );

  const agents = useManagedAgentsQuery({ enabled: mode === "private" });
  const channels = useChannelsQuery({ enabled: false });
  const personalAgents = (agents.data ?? []).filter(
    (agent) =>
      agent.relayUrl === relayUrl &&
      agent.pubkey !== sender &&
      (agent.status === "running" || agent.status === "deployed"),
  );
  const privateAgent =
    personalAgents.find((agent) => agent.pubkey === agentKey) ??
    (personalAgents.length === 1 ? personalAgents[0] : undefined);
  const contextPath = includePath ? draft.path : null;

  async function resolveContact() {
    if (!draft.lookupUrl)
      throw new Error(
        "This domain is unavailable for official contact lookup.",
      );
    const metadata = await invokeTauri<unknown>("lookup_website_recipient", {
      url: draft.lookupUrl,
    });
    const binding = verifyWebsiteContact(draft.domain, metadata);
    const agent = (await revalidateRelayAgents([binding.agentPubkey])).find(
      (candidate) => candidate.pubkey === binding.agentPubkey,
    );
    if (
      !agent ||
      agent.ownerPubkey !== binding.ownerPubkey ||
      agent.pubkey === sender
    ) {
      throw new Error(
        "Couldn't confirm the designated agent's verified owner in this community.",
      );
    }
    const sharedChannels = new Set(
      (channels.data ?? [])
        .filter((channel) => channel.isMember && channel.archivedAt === null)
        .map((channel) => channel.id),
    );
    if (!relayAgentIsSharedWithUser(agent, sharedChannels, sender)) {
      throw new Error(
        "The official agent isn't available to message from this community.",
      );
    }
    return { binding, name: agent.name.trim() || "Agent" };
  }

  async function run(action: (isCurrent: () => boolean) => Promise<void>) {
    if (operation.current) return;
    const token = {};
    operation.current = token;
    const isCurrent = () => operation.current === token;
    setPending(true);
    setError("");
    try {
      await action(isCurrent);
    } catch (failure) {
      if (isCurrent())
        setError(
          typeof failure === "string"
            ? failure
            : failure instanceof Error
              ? failure.message
              : "Couldn't complete this request.",
        );
    } finally {
      if (isCurrent()) {
        operation.current = null;
        setPending(false);
      }
    }
  }

  function readPage() {
    void run(async (isCurrent) => {
      setMode("private");
      setContact(null);
      setQuestion("");
      setPage(null);
      setPastedText("");
      if (!draft.pageUrl) return;
      const result = await invokeTauri<Page>("read_website_recipient", {
        url: draft.pageUrl,
      });
      if (isCurrent()) setPage(result);
    });
  }

  function lookup() {
    void run(async (isCurrent) => {
      setMode("official");
      setContact(null);
      setQuestion("");
      setPage(null);
      setPastedText("");
      setIncludePath(false);
      const result = await resolveContact();
      if (isCurrent()) {
        setContact(result.binding);
        setRecipientName(result.name);
      }
    });
  }

  return (
    <section
      aria-label="Website recipient"
      className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5"
    >
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={readPage} variant="outline">
          Ask my agent
        </Button>
        <Button
          disabled={pending || !draft.lookupUrl}
          onClick={lookup}
          variant="outline"
        >
          Look up official contact
        </Button>
      </div>
      {mode === null && (
        <p className="text-sm text-muted-foreground">
          {draft.pageUrl
            ? `Ask my agent reads ${draft.pageUrl} without signing in. Official lookup reads the domain’s public NIP-05 metadata.`
            : "This address can't be read as a public page. You can paste an excerpt for your agent."}
        </p>
      )}
      {pending && (
        <p role="status" className="text-sm">
          Working…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {mode === "private" && (
        <div className="max-w-2xl space-y-3">
          <p className="text-sm">
            Private help in a direct message to your agent.
          </p>
          {page ? (
            <details className="text-sm">
              <summary>Review excerpt from {page.url}</summary>
              <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">
                {page.text}
              </p>
            </details>
          ) : !pending || pastedText ? (
            <label className="block space-y-1 text-sm">
              <span>
                Couldn't read this page. Paste the text you want your agent to
                use.
              </span>
              <textarea
                className="block w-full rounded-md border bg-background p-2"
                disabled={pending}
                maxLength={16_000}
                onChange={(event) => setPastedText(event.target.value)}
                rows={4}
                value={pastedText}
              />
            </label>
          ) : null}
          {personalAgents.length > 1 ? (
            <label className="block space-x-2 text-sm">
              <span>Your agent</span>
              <select
                className="rounded-md border bg-background p-1"
                disabled={pending}
                onChange={(event) => setAgentKey(event.target.value)}
                value={agentKey}
              >
                <option value="">Choose an agent</option>
                {personalAgents.map((agent) => (
                  <option key={agent.pubkey} value={agent.pubkey}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
          ) : privateAgent ? (
            <p className="text-sm">Your agent · {privateAgent.name}</p>
          ) : (
            <p className="text-sm">
              {agents.isPending
                ? "Checking your agents…"
                : "No running managed agent is available in this community."}
            </p>
          )}
          <label className="block space-y-1 text-sm">
            <span>Question for your agent</span>
            <textarea
              className="block w-full rounded-md border bg-background p-2"
              disabled={pending}
              maxLength={4_000}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
              value={question}
            />
          </label>
          <Button
            disabled={
              pending ||
              !privateAgent ||
              !question.trim() ||
              !(page || pastedText.trim())
            }
            onClick={() => {
              if (
                !privateAgent ||
                !question.trim() ||
                !(page || pastedText.trim())
              )
                return;
              const agent = privateAgent;
              void run(async (isCurrent) => {
                const fresh = (
                  await revalidateRelayAgents([agent.pubkey])
                ).find((candidate) => candidate.pubkey === agent.pubkey);
                if (
                  !fresh ||
                  fresh.ownerPubkey !== sender ||
                  !relayAgentIsSharedWithUser(fresh, new Set(), sender)
                ) {
                  throw new Error(
                    "Couldn't confirm this agent belongs to your current identity.",
                  );
                }
                if (isCurrent())
                  await send(
                    agent.pubkey,
                    privatePageQuestion(
                      question,
                      page?.url ?? "Text you supplied",
                      page?.text ?? pastedText,
                    ),
                    isCurrent,
                  );
              });
            }}
          >
            Send to my agent
          </Button>
        </div>
      )}
      {mode === "official" && contact && (
        <div className="max-w-2xl space-y-3">
          <div className="space-y-1 text-sm">
            <p className="font-semibold">
              Verified representative for {contact.domain}
            </p>
            <p>
              {recipientName} · Hosted by {contact.host}
            </p>
            <p className="break-all text-muted-foreground">
              Agent key {contact.agentPubkey}
            </p>
            <p className="break-all text-muted-foreground">
              Contact key {contact.domainPubkey}
            </p>
            <p className="break-all text-muted-foreground">
              Sending as {sender}
            </p>
          </div>
          {draft.path && (
            <label className="flex items-start gap-2 text-sm">
              <input
                checked={includePath}
                disabled={pending}
                onChange={(event) => setIncludePath(event.target.checked)}
                type="checkbox"
              />
              <span className="break-all">Include page path {draft.path}</span>
            </label>
          )}
          <p className="break-all text-sm">
            Website context included · {contact.domain}
            {contextPath}
          </p>
          <label className="block space-y-1 text-sm">
            <span>Message for {contact.domain}</span>
            <textarea
              className="block w-full rounded-md border bg-background p-2"
              disabled={pending}
              maxLength={4_000}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              value={question}
            />
          </label>
          <Button
            disabled={pending || !question.trim()}
            onClick={() => {
              if (!question.trim()) return;
              void run(async (isCurrent) => {
                const refreshed = await resolveContact();
                if (!isCurrent()) return;
                if (
                  JSON.stringify(refreshed.binding) !==
                    JSON.stringify(contact) ||
                  refreshed.name !== recipientName
                ) {
                  setContact(null);
                  throw new Error(
                    "The site's representative changed. Look up the contact again to review the new recipient.",
                  );
                }
                await send(
                  contact.agentPubkey,
                  websiteMessage(question, contact.domain, contextPath),
                  isCurrent,
                );
              });
            }}
          >
            Message {contact.domain}
          </Button>
        </div>
      )}
    </section>
  );
}
