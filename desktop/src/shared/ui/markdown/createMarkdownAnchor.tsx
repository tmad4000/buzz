import * as React from "react";

import { parseChannelLink } from "@/features/messages/lib/channelLink";
import { resolveMessageLinkRenderTarget } from "@/features/messages/lib/messageLink";
import { renderAudioMessageAttachment } from "@/features/messages/ui/AudioMessageAttachment";
import { parseEntityLink } from "@/shared/lib/entityLink";
import { parseSupportedLinkPreview } from "@/shared/lib/linkPreview";
import { rewriteRelayUrl } from "@/shared/lib/mediaUrl";
import { resolveFileCard, resolveSnapshotCard } from "../markdownFileCard";
import { hasBlockMedia } from "../markdownUtils";
import { AgentSnapshotCard } from "./AgentSnapshotCard";
import {
  AuthoredDeepLinkAnchor,
  ChannelDeepLinkAnchor,
} from "./ChannelDeepLink";
import { EntityLinkAnchor } from "./entityLinks";
import { ExternalLinkAnchor } from "./ExternalLinkAnchor";
import { FileCard } from "./FileCard";
import { isRelayDownloadable } from "./mediaEntry";
import { MessageLinkPill } from "./MessageLinkPill";
import { useMarkdownRuntime } from "./runtimeContext";
import { getReactNodeText } from "./utils";

export function createMarkdownAnchor(interactive: boolean, showMedia: boolean) {
  return function MarkdownAnchor({
    children,
    href,
    ...props
  }: React.ComponentPropsWithoutRef<"a">) {
    const {
      channels,
      imetaByUrl,
      onOpenChannel,
      onOpenEntityLink,
      onOpenMessageLink,
      onImportSnapshotFromUrl,
      relayOrigin,
      resolveChannelReferences,
      snapshotSharedBy,
    } = useMarkdownRuntime();
    if (!showMedia) {
      return <span className="font-medium text-current">{children}</span>;
    }
    if (hasBlockMedia(React.Children.toArray(children))) {
      return <>{children}</>;
    }

    const label = getReactNodeText(children);

    const audioAttachment = renderAudioMessageAttachment(
      href ? imetaByUrl?.get(href) : undefined,
      href,
      label,
      href && isRelayDownloadable(href, relayOrigin ?? undefined)
        ? href
        : undefined,
    );
    if (audioAttachment) return audioAttachment;

    // Classify verified agent/team snapshots before generic files.
    const snapshotCard = resolveSnapshotCard(
      href ? imetaByUrl?.get(href) : undefined,
      href,
      label,
    );
    if (snapshotCard) {
      if (!interactive) {
        return (
          <FileCard
            href={rewriteRelayUrl(snapshotCard.href)}
            filename={snapshotCard.filename}
            size={snapshotCard.size}
          />
        );
      }
      return (
        <AgentSnapshotCard
          displayName={snapshotCard.displayName}
          href={snapshotCard.href}
          filename={snapshotCard.filename}
          sharedBy={snapshotSharedBy}
          size={snapshotCard.size}
          sha256={snapshotCard.sha256}
          snapshotKind={snapshotCard.snapshotKind}
          thumb={snapshotCard.thumb}
          onImport={(fileBytes, fileName) => {
            onImportSnapshotFromUrl?.(
              fileBytes,
              fileName,
              snapshotCard.snapshotKind,
            );
          }}
        />
      );
    }

    // Render non-media imeta links as download cards; media uses `img`.
    const card = resolveFileCard(
      href ? imetaByUrl?.get(href) : undefined,
      href,
      label,
    );
    if (card) {
      return (
        <FileCard href={card.href} filename={card.filename} size={card.size} />
      );
    }

    if (!interactive) {
      return <span className="font-medium text-current">{children}</span>;
    }

    // Keep Buzz channel/message navigation in-app.
    if (href) {
      if (parseChannelLink(href).ok) {
        return (
          <ChannelDeepLinkAnchor
            {...props}
            href={href}
            interactive={interactive}
          >
            {children}
          </ChannelDeepLinkAnchor>
        );
      }
      const messageLinkTarget = resolveMessageLinkRenderTarget({
        href,
        label,
      });
      if (messageLinkTarget.kind !== "none") {
        if (messageLinkTarget.kind === "pill") {
          return (
            <MessageLinkPill
              channels={channels}
              interactive={interactive}
              link={messageLinkTarget.link}
              onOpenChannel={onOpenChannel}
              onOpenMessageLink={onOpenMessageLink}
              resolveChannelReference={resolveChannelReferences}
            />
          );
        }

        return (
          <AuthoredDeepLinkAnchor
            channelId={messageLinkTarget.link.channelId}
            href={href}
            interactive={interactive}
            messageLink={messageLinkTarget.link}
          >
            {children}
          </AuthoredDeepLinkAnchor>
        );
      }
      // Malformed message deep links fall through to external handling.
    }

    // `buzz://pr|issue|repo|project?…` entity links navigate in-app;
    // malformed ones fall through to the default anchor. The provider-backed
    // component keeps metadata tooltips available for both raw chips and
    // authored Markdown labels.
    if (href) {
      const entityAnchor = React.createElement(
        EntityLinkAnchor,
        {
          href,
          onOpenEntityLink,
          relayOrigin,
          interactive,
          asChip: label === href,
        },
        children,
      );
      if (
        parseEntityLink(href).ok ||
        parseSupportedLinkPreview(href, relayOrigin)?.href.startsWith("buzz://")
      )
        return entityAnchor;
    }

    const supportedLinkPreview = href
      ? parseSupportedLinkPreview(href, relayOrigin)
      : null;
    const isLinearLink = supportedLinkPreview?.kind === "linear-issue";

    return (
      <ExternalLinkAnchor
        anchorProps={props}
        href={href}
        isLinearLink={isLinearLink}
        label={label}
      >
        {children}
      </ExternalLinkAnchor>
    );
  };
}
