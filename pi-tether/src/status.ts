const STATUS_PING =
	/^\s*(?:\?+|status\??|next\??|what'?s next\??|where are we\??|where are things\??|what are you doing\??|what'?s going on\??|what'?s up\??|progress\??|eta\??|how'?s it going\??)\s*[.!]*\s*$/i;

/** True when the whole message is a bare status ping ("??", "status?", "next?", …). */
export function isStatusPing(text: string): boolean {
	return STATUS_PING.test(text);
}

export function formatElapsed(ms: number): string {
	const s = Math.max(0, Math.round(ms / 1000));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${s % 60}s`;
	return `${Math.floor(m / 60)}h ${m % 60}m`;
}
