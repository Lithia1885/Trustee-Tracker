import type { ActionItem, Decision, Item, Meeting, MeetingEntry } from '../types';
import type { GraphClient } from './client';
import { GraphError } from './client';
import {
  mapActionItem,
  mapDecision,
  mapItem,
  mapMeeting,
  mapMeetingEntry,
  type GraphListItem,
} from './mappers';

const PAGE_SIZE = 200;

function listItemsPath(siteId: string, listName: string): string {
  return `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(
    listName,
  )}/items?$expand=fields&$top=${PAGE_SIZE}`;
}

export class ListMissingError extends Error {
  listName: string;
  constructor(listName: string) {
    super(`SharePoint list not found: ${listName}`);
    this.name = 'ListMissingError';
    this.listName = listName;
  }
}

interface SharePointListSummary {
  id: string;
  displayName?: string;
  name?: string;
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveListIds(
  client: GraphClient,
  siteId: string,
  names: readonly string[],
): Promise<Record<string, string>> {
  const passthrough: Record<string, string> = {};
  const toResolve = new Set<string>();
  for (const n of names) {
    if (GUID_RE.test(n)) passthrough[n] = n;
    else toResolve.add(n);
  }
  if (toResolve.size === 0) return passthrough;

  const path = `/sites/${encodeURIComponent(
    siteId,
  )}/lists?$select=id,displayName,name`;
  const lists = await client.fetchAll<SharePointListSummary>(path);
  const out: Record<string, string> = { ...passthrough };
  for (const want of toResolve) {
    const match = lists.find(
      (l) => l.displayName === want || l.name === want,
    );
    if (!match) throw new ListMissingError(want);
    out[want] = match.id;
  }
  return out;
}

async function readList<T>(
  client: GraphClient,
  siteId: string,
  listName: string,
  map: (row: GraphListItem) => T,
): Promise<T[]> {
  try {
    const rows = await client.fetchAll<GraphListItem>(listItemsPath(siteId, listName));
    return rows.map(map);
  } catch (err) {
    if (err instanceof GraphError && err.isNotFound()) {
      throw new ListMissingError(listName);
    }
    throw err;
  }
}

export function fetchItems(
  client: GraphClient,
  siteId: string,
  listName: string,
): Promise<Item[]> {
  return readList(client, siteId, listName, (row) => mapItem(row));
}

export function fetchMeetingEntries(
  client: GraphClient,
  siteId: string,
  listName: string,
): Promise<MeetingEntry[]> {
  return readList(client, siteId, listName, (row) => mapMeetingEntry(row));
}

export function fetchActionItems(
  client: GraphClient,
  siteId: string,
  listName: string,
): Promise<ActionItem[]> {
  return readList(client, siteId, listName, (row) => mapActionItem(row));
}

export function fetchDecisions(
  client: GraphClient,
  siteId: string,
  listName: string,
): Promise<Decision[]> {
  return readList(client, siteId, listName, (row) => mapDecision(row));
}

export function fetchMeetings(
  client: GraphClient,
  siteId: string,
  listName: string,
): Promise<Meeting[]> {
  return readList(client, siteId, listName, (row) => mapMeeting(row));
}

function listItemPath(siteId: string, listName: string, itemId?: string): string {
  const base = `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listName)}/items`;
  return itemId ? `${base}/${encodeURIComponent(itemId)}` : base;
}

/**
 * Columns the app writes when the site has them and quietly drops when
 * it does not. They carry new behaviour (reported dates, entry kind,
 * status baseline) onto lists that were provisioned before those
 * columns existed, so an admin can add them on their own schedule
 * without the app failing every write in the meantime.
 *
 * Keyed `list::Field`. A write that SharePoint rejects outright is
 * retried once without them; if that succeeds, the columns are recorded
 * as absent for the rest of the session.
 */
const absentColumns = new Set<string>();

function columnKey(listName: string, field: string): string {
  return `${listName}::${field}`;
}

export function isColumnKnownAbsent(listName: string, field: string): boolean {
  return absentColumns.has(columnKey(listName, field));
}

export function forgetAbsentColumns(): void {
  absentColumns.clear();
}

export interface WriteOptions {
  /** Field names that may not exist on the list yet. */
  optionalFields?: readonly string[];
}

interface SplitFields {
  /** Fields actually going to SharePoint. */
  sent: Record<string, unknown>;
  /** Of those, the optional ones — the candidates to drop on a retry. */
  optionalSent: string[];
}

function withoutAbsentColumns(
  listName: string,
  fields: Record<string, unknown>,
  optionalFields: readonly string[],
): SplitFields {
  const sent: Record<string, unknown> = {};
  const optionalSent: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (optionalFields.includes(k) && isColumnKnownAbsent(listName, k)) continue;
    sent[k] = v;
    if (optionalFields.includes(k)) optionalSent.push(k);
  }
  return { sent, optionalSent };
}

// A rejected write means SharePoint stored nothing, so retrying without
// the optional columns cannot duplicate a record.
function isSchemaRejection(err: unknown): boolean {
  return err instanceof GraphError && (err.status === 400 || err.status === 422);
}

async function writeWithOptionalColumns<T>(
  listName: string,
  fields: Record<string, unknown>,
  options: WriteOptions | undefined,
  send: (fields: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  const optional = options?.optionalFields ?? [];
  const { sent, optionalSent } = withoutAbsentColumns(listName, fields, optional);
  if (optionalSent.length === 0) return send(sent);
  try {
    return await send(sent);
  } catch (err) {
    if (!isSchemaRejection(err)) throw err;
    const retryFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sent)) {
      if (!optionalSent.includes(k)) retryFields[k] = v;
    }
    let result: T;
    try {
      result = await send(retryFields);
    } catch {
      // The optional columns were not the problem — report the real one.
      throw err;
    }
    for (const field of optionalSent) absentColumns.add(columnKey(listName, field));
    console.warn(
      `SharePoint list "${listName}" has no column(s) ${optionalSent.join(', ')}. ` +
        'Saved without them for this session. See docs/sharepoint-columns.md.',
    );
    return result;
  }
}

function annotateArrayFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      out[`${k}@odata.type`] = 'Collection(Edm.String)';
    }
    out[k] = v;
  }
  return out;
}

export async function createListItem(
  client: GraphClient,
  siteId: string,
  listName: string,
  fields: Record<string, unknown>,
  options?: WriteOptions,
): Promise<{ id: string }> {
  const created = await writeWithOptionalColumns(listName, fields, options, (body) =>
    client.fetchJson<{ id: string }>(`${listItemPath(siteId, listName)}?$expand=fields`, {
      method: 'POST',
      body: JSON.stringify({ fields: annotateArrayFields(body) }),
    }),
  );
  return { id: created.id };
}

export async function patchListItemFields(
  client: GraphClient,
  siteId: string,
  listName: string,
  itemId: string,
  fields: Record<string, unknown>,
  options?: WriteOptions,
): Promise<void> {
  await writeWithOptionalColumns(listName, fields, options, (body) =>
    client.fetchJson<unknown>(`${listItemPath(siteId, listName, itemId)}/fields`, {
      method: 'PATCH',
      body: JSON.stringify(annotateArrayFields(body)),
    }),
  );
}

export async function deleteListItem(
  client: GraphClient,
  siteId: string,
  listName: string,
  itemId: string,
): Promise<void> {
  await client.fetchJson<unknown>(listItemPath(siteId, listName, itemId), {
    method: 'DELETE',
  });
}
