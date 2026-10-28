// Getting the receipt into an email to Oracle. A web app cannot fill in the "To" line of an email that
// carries an attachment, so: Oracle's address is copied first, then the phone's share sheet opens with the
// receipt, the subject and the coding; you pick Outlook and paste the address.
import type { Receipt, Setup } from './model';
import { attachmentName, buildEmail } from './oracle';
import { getFile } from './store';
import { download } from './io';

export async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

export type SendResult = 'shared' | 'mailto' | 'cancelled';

export async function sendReceipt(r: Receipt, s: Setup): Promise<SendResult> {
  const blob = await getFile(r.id);
  if (!blob) throw new Error('The receipt file is missing on this phone.');
  const { to, subject, body } = buildEmail(r, s);
  const file = new File([blob], attachmentName(r), { type: r.mime || blob.type });
  await copyText(to);
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: subject, text: `${subject}\n\n${body}` });
      return 'shared';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled';
      // Some phones refuse text alongside files: try the file and subject only.
      try { await navigator.share({ files: [file], title: subject }); return 'shared'; }
      catch (e2: any) { if (e2?.name === 'AbortError') return 'cancelled'; }
    }
  }
  // Computers and older phones: save the file and open an email with everything but the attachment.
  download(file.name, file);
  location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + '\n\n(Attach the receipt file that was just saved: ' + file.name + ')')}`;
  return 'mailto';
}
