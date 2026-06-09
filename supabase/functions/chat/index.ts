// chat — sends a user message, streams the persona's reply via SSE, tracks
// hidden interest level and ghost/end/number outcomes.
import {
  adminClient,
  consumeCredit,
  corsHeaders,
  errorResponse,
  getUser,
  handleOptions,
} from '../_shared/utils.ts';
import {
  anthropicClient,
  buildPersonaBlock,
  CHAT_MODEL,
  CHAT_SYSTEM_PREFIX,
  parseStateTag,
  PersonaRow,
} from '../_shared/anthropic.ts';

const HOLDBACK = 80; // chars withheld from the stream so the <state/> tag never leaks

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const user = await getUser(req);
  if (!user) return errorResponse('Unauthorized', 401);

  const { conversation_id, content } = await req.json().catch(() => ({}));
  if (!conversation_id || typeof content !== 'string' || !content.trim()) {
    return errorResponse('conversation_id and content are required');
  }
  if (content.length > 2000) return errorResponse('Message too long');

  const admin = adminClient();
  const { data: convo } = await admin
    .from('conversations')
    .select('*, personas(*)')
    .eq('id', conversation_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!convo) return errorResponse('Conversation not found', 404);
  if (convo.status === 'ghosted' || convo.status === 'ended') {
    return errorResponse('This conversation is over', 409);
  }

  const ok = await consumeCredit(user.id, user.tier);
  if (!ok) return errorResponse('Out of message credits', 402);

  // Persist the user's message first
  const { data: userMsg, error: insertErr } = await admin
    .from('messages')
    .insert({ conversation_id, role: 'user', content: content.trim() })
    .select()
    .single();
  if (insertErr) return errorResponse(insertErr.message, 500);

  const { data: history } = await admin
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true })
    .limit(80);

  const persona = convo.personas as PersonaRow;
  const messages = (history ?? []).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const anthropic = anthropicClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      try {
        const claudeStream = anthropic.messages.stream({
          model: CHAT_MODEL,
          max_tokens: 1024,
          system: [
            {
              type: 'text',
              text: CHAT_SYSTEM_PREFIX,
              cache_control: { type: 'ephemeral' },
            },
            {
              type: 'text',
              text: buildPersonaBlock(persona, convo.interest_level),
            },
          ],
          messages,
        });

        // Stream tokens, holding back a tail buffer so the <state/> control
        // tag (and any partial prefix of it) never reaches the client.
        let raw = '';
        let emitted = 0;
        for await (const event of claudeStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            raw += event.delta.text;
            const tagStart = raw.indexOf('<state');
            const safeEnd =
              tagStart >= 0 ? tagStart : Math.max(0, raw.length - HOLDBACK);
            if (safeEnd > emitted) {
              send('token', { text: raw.slice(emitted, safeEnd) });
              emitted = safeEnd;
            }
          }
        }
        await claudeStream.finalMessage();

        const { text, interest, action } = parseStateTag(raw);
        // Flush any held-back reply text (minus the tag)
        if (text.length > emitted) {
          send('token', { text: text.slice(emitted) });
        }

        const status =
          action === 'ghost'
            ? 'ghosted'
            : action === 'end'
            ? 'ended'
            : action === 'give_number'
            ? 'number_given'
            : 'active';
        const ghosted = action === 'ghost' || text.length === 0;

        let assistantMessageId: string | null = null;
        if (!ghosted) {
          const { data: aMsg } = await admin
            .from('messages')
            .insert({ conversation_id, role: 'assistant', content: text })
            .select()
            .single();
          assistantMessageId = aMsg?.id ?? null;
        }

        await admin
          .from('conversations')
          .update({
            interest_level: ghosted ? 0 : interest,
            status: ghosted ? 'ghosted' : status,
          })
          .eq('id', conversation_id);

        send('done', {
          reply: ghosted ? null : text,
          interest_level: ghosted ? 0 : interest,
          status: ghosted ? 'ghosted' : status,
          user_message_id: userMsg.id,
          assistant_message_id: assistantMessageId,
        });
      } catch (e) {
        send('error', { error: e instanceof Error ? e.message : 'Chat failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
});
