/**
 * PermissionDialog - Non-modal permission gate component.
 * Allows scrolling back while the prompt is displayed.
 */

import type { Component, Focusable } from "@earendil-works/pi-tui";
import { Input, Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

const BLOCK_CURSOR = "\x1b[7m \x1b[27m";

export interface PermissionResult {
	allowed: boolean;
	feedback?: string;
}

export type PermissionDialogResult = PermissionResult | null;

const OPTIONS = [
	{ label: "Allow", description: "Proceed with this operation" },
	{ label: "Deny", description: "Cancel this operation" },
	{ label: "Deny with feedback", description: "Cancel and explain why" },
] as const;

export class PermissionDialog implements Component, Focusable {
	private title: string;
	private theme: Theme;

	private selectedIdx = 0;
	private inFeedbackMode = false;
	private feedbackInput: Input;
	private feedbackValue = "";

	private _focused = false;
	get focused(): boolean { return this._focused; }
	set focused(value: boolean) { this._focused = value; }

	onDone?: (result: PermissionDialogResult) => void;

	constructor(title: string, _details: string | undefined, theme: Theme) {
		this.title = title;
		this.theme = theme;
		this.feedbackInput = new Input();
	}

	private get isFeedbackSelected(): boolean {
		return this.selectedIdx === 2;
	}

	handleInput(data: string): void {
		if (this.inFeedbackMode) {
			if (matchesKey(data, Key.escape) || matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
				this.inFeedbackMode = false;
				this.feedbackValue = this.feedbackInput.getValue();
				return;
			}
			if (matchesKey(data, Key.enter)) {
				this.onDone?.({ allowed: false, feedback: this.feedbackInput.getValue().trim() || undefined });
				return;
			}
			this.feedbackInput.handleInput(data);
			return;
		}

		if (matchesKey(data, Key.up)) {
			if (this.selectedIdx > 0) this.selectedIdx--;
		} else if (matchesKey(data, Key.down)) {
			if (this.selectedIdx < OPTIONS.length - 1) this.selectedIdx++;
		} else if (matchesKey(data, Key.enter)) {
			this.selectCurrentOption();
		} else if (matchesKey(data, Key.escape)) {
			this.onDone?.(null);
		} else if (this.isFeedbackSelected) {
			this.inFeedbackMode = true;
			this.feedbackInput.setValue(this.feedbackValue);
			this.feedbackInput.handleInput(data);
		}
	}

	private selectCurrentOption(): void {
		switch (this.selectedIdx) {
			case 0:
				this.onDone?.({ allowed: true });
				break;
			case 1:
				this.onDone?.({ allowed: false });
				break;
			case 2:
				this.inFeedbackMode = true;
				this.feedbackInput.setValue(this.feedbackValue);
				break;
		}
	}

	invalidate(): void {
		this.feedbackInput.invalidate?.();
	}

	render(width: number): string[] {
		const t = this.theme;
		const lines: string[] = [];

		for (const line of wrapTextWithAnsi(this.title, width - 2)) {
			lines.push(line);
		}
		lines.push("");

		for (let i = 0; i < OPTIONS.length; i++) {
			const opt = OPTIONS[i];
			const isCursor = i === this.selectedIdx;
			const num = `${i + 1}.`;
			const labelLine = isCursor
				? t.fg("accent", `> ${num} ${opt.label}`)
				: `  ${num} ${opt.label}`;
			lines.push(truncateToWidth("  " + labelLine, width));
			if (isCursor) {
				lines.push(truncateToWidth(`       ${t.fg("muted", opt.description)}`, width));
			}
		}

		if (this.inFeedbackMode) {
			lines.push("");
			lines.push(t.fg("muted", "  Why are you denying this? (Esc to go back)"));
			const inputVal = this.feedbackInput.getValue();
			lines.push("  > " + inputVal + BLOCK_CURSOR);
		}

		lines.push("");
		lines.push(truncateToWidth(t.fg("dim", "Enter to select · ↑↓ to navigate · Esc to cancel"), width));

		return lines.map((l) => truncateToWidth(l, width));
	}
}
