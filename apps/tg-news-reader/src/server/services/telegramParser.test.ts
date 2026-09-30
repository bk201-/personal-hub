import { describe, expect, it, vi } from 'vitest';

// Create mock Api classes
class MockMessageEntityUrl {
  offset: number;
  length: number;
  constructor(o: { offset: number; length: number }) {
    this.offset = o.offset;
    this.length = o.length;
  }
}
class MockMessageEntityTextUrl {
  offset: number;
  length: number;
  url: string;
  constructor(o: { offset: number; length: number; url: string }) {
    this.offset = o.offset;
    this.length = o.length;
    this.url = o.url;
  }
}
class MockMessageEntityHashtag {
  offset: number;
  length: number;
  constructor(o: { offset: number; length: number }) {
    this.offset = o.offset;
    this.length = o.length;
  }
}
class MockMessageMediaPhoto {}
class MockMessageMediaDocument {}
class MockMessageMediaWebPage {}
class MockPhoto {
  sizes: unknown[];
  constructor(
    public id: number,
    sizes: unknown[],
  ) {
    this.sizes = sizes;
  }
}
class MockPhotoSize {
  size: number;
  constructor(size: number) {
    this.size = size;
  }
}
class MockDocument {
  size: bigint;
  mimeType: string;
  attributes: unknown[];
  constructor(o: { size: bigint; mimeType: string; attributes?: unknown[] }) {
    this.size = o.size;
    this.mimeType = o.mimeType;
    this.attributes = o.attributes ?? [];
  }
}
class MockDocumentAttributeVideo {}
class MockDocumentAttributeAudio {}
class MockDocumentAttributeFilename {
  fileName: string;
  constructor(o: { fileName: string }) {
    this.fileName = o.fileName;
  }
}
class MockWebPage {
  cachedPage: unknown;
  url: string;
  constructor(cachedPage?: unknown, url = '') {
    this.cachedPage = cachedPage;
    this.url = url;
  }
}
class MockPage {
  blocks: unknown[];
  part: boolean;
  photos: unknown[];
  documents: unknown[];
  constructor(blocks: unknown[], part = false, photos: unknown[] = [], documents: unknown[] = []) {
    this.blocks = blocks;
    this.part = part;
    this.photos = photos;
    this.documents = documents;
  }
}
class MockTextPlain {
  text: string;
  constructor(text: string) {
    this.text = text;
  }
}
class MockTextEmpty {}
class MockTextConcat {
  texts: unknown[];
  constructor(texts: unknown[]) {
    this.texts = texts;
  }
}
class MockTextImage {}
class MockTextBold {
  constructor(public text: unknown) {}
}
class MockTextItalic {
  constructor(public text: unknown) {}
}
class MockTextStrike {
  constructor(public text: unknown) {}
}
class MockTextFixed {
  constructor(public text: unknown) {}
}
class MockTextUrl {
  constructor(
    public text: unknown,
    public url: string,
  ) {}
}
class MockTextEmail {
  constructor(
    public text: unknown,
    public email: string,
  ) {}
}
class MockPageBlockParagraph {
  text: unknown;
  constructor(text: unknown) {
    this.text = text;
  }
}
class MockPageBlockTitle {
  text: unknown;
  constructor(text: unknown) {
    this.text = text;
  }
}
class MockPageBlockHeader {
  text: unknown;
  constructor(text: unknown) {
    this.text = text;
  }
}
class MockPageBlockSubheader {
  text: unknown;
  constructor(text: unknown) {
    this.text = text;
  }
}
class MockPageBlockSubtitle {
  text: unknown;
  constructor(text: unknown) {
    this.text = text;
  }
}
class MockPageBlockKicker {
  text: unknown;
  constructor(text: unknown) {
    this.text = text;
  }
}
class MockPageBlockFooter {
  text: unknown;
  constructor(text: unknown) {
    this.text = text;
  }
}
class MockPageBlockPreformatted {
  text: unknown;
  constructor(text: unknown) {
    this.text = text;
  }
}
class MockPageBlockDivider {}
class MockPageBlockBlockquote {
  text: unknown;
  constructor(text: unknown) {
    this.text = text;
  }
}
class MockPageBlockPullquote {
  text: unknown;
  constructor(text: unknown) {
    this.text = text;
  }
}
class MockPageBlockList {
  items: unknown[];
  constructor(items: unknown[]) {
    this.items = items;
  }
}
class MockPageListItemText {
  text: unknown;
  constructor(text: unknown) {
    this.text = text;
  }
}
class MockPageListItemBlocks {
  blocks: unknown[];
  constructor(blocks: unknown[]) {
    this.blocks = blocks;
  }
}
class MockPageBlockOrderedList {
  items: unknown[];
  constructor(items: unknown[]) {
    this.items = items;
  }
}
class MockPageListOrderedItemText {
  text: unknown;
  constructor(text: unknown) {
    this.text = text;
  }
}
class MockPageListOrderedItemBlocks {
  blocks: unknown[];
  constructor(blocks: unknown[]) {
    this.blocks = blocks;
  }
}
class MockPageBlockDetails {
  title: unknown;
  blocks: unknown[];
  constructor(title: unknown, blocks: unknown[]) {
    this.title = title;
    this.blocks = blocks;
  }
}
class MockPageBlockPhoto {
  constructor(
    public photoId: number,
    public caption?: { text?: unknown },
  ) {}
}
class MockPageBlockTable {
  constructor(public rows: { cells: { text?: unknown }[] }[]) {}
}
class MockPageBlockAuthorDate {
  constructor(public author: unknown) {}
}

const mockApi = {
  MessageEntityUrl: MockMessageEntityUrl,
  MessageEntityTextUrl: MockMessageEntityTextUrl,
  MessageEntityHashtag: MockMessageEntityHashtag,
  MessageMediaPhoto: MockMessageMediaPhoto,
  MessageMediaDocument: MockMessageMediaDocument,
  MessageMediaWebPage: MockMessageMediaWebPage,
  Photo: MockPhoto,
  PhotoSize: MockPhotoSize,
  Document: MockDocument,
  DocumentAttributeVideo: MockDocumentAttributeVideo,
  DocumentAttributeAudio: MockDocumentAttributeAudio,
  DocumentAttributeFilename: MockDocumentAttributeFilename,
  WebPage: MockWebPage,
  Page: MockPage,
  TextPlain: MockTextPlain,
  TextEmpty: MockTextEmpty,
  TextConcat: MockTextConcat,
  TextImage: MockTextImage,
  TextBold: MockTextBold,
  TextItalic: MockTextItalic,
  TextStrike: MockTextStrike,
  TextFixed: MockTextFixed,
  TextUrl: MockTextUrl,
  TextEmail: MockTextEmail,
  PageBlockParagraph: MockPageBlockParagraph,
  PageBlockTitle: MockPageBlockTitle,
  PageBlockHeader: MockPageBlockHeader,
  PageBlockSubheader: MockPageBlockSubheader,
  PageBlockSubtitle: MockPageBlockSubtitle,
  PageBlockKicker: MockPageBlockKicker,
  PageBlockFooter: MockPageBlockFooter,
  PageBlockPreformatted: MockPageBlockPreformatted,
  PageBlockDivider: MockPageBlockDivider,
  PageBlockBlockquote: MockPageBlockBlockquote,
  PageBlockPullquote: MockPageBlockPullquote,
  PageBlockList: MockPageBlockList,
  PageListItemText: MockPageListItemText,
  PageListItemBlocks: MockPageListItemBlocks,
  PageBlockOrderedList: MockPageBlockOrderedList,
  PageListOrderedItemText: MockPageListOrderedItemText,
  PageListOrderedItemBlocks: MockPageListOrderedItemBlocks,
  PageBlockDetails: MockPageBlockDetails,
  PageBlockPhoto: MockPageBlockPhoto,
  PageBlockTable: MockPageBlockTable,
  PageBlockAuthorDate: MockPageBlockAuthorDate,
};

vi.mock('./telegramClient.js', () => ({
  getApi: () => mockApi,
}));

import {
  extractLinks,
  extractHashtags,
  parseMessageFields,
  extractInstantViewText,
  extractInstantViewPage,
} from './telegramParser.js';

describe('extractLinks', () => {
  it('extracts URL entities', () => {
    const text = 'Check https://example.com and more';
    const entities = [new MockMessageEntityUrl({ offset: 6, length: 19 })];
    const links = extractLinks(text, entities as any);
    expect(links).toContain('https://example.com');
  });

  it('extracts TextUrl entities (hyperlinks)', () => {
    const text = 'Click here for details';
    const entities = [new MockMessageEntityTextUrl({ offset: 6, length: 4, url: 'https://hidden.com' })];
    const links = extractLinks(text, entities as any);
    expect(links).toContain('https://hidden.com');
  });

  it('extracts URLs from plain text via regex', () => {
    const text = 'Visit https://regex.com/path?q=1 today';
    const links = extractLinks(text);
    expect(links).toContain('https://regex.com/path?q=1');
  });

  it('deduplicates entity URLs and regex URLs', () => {
    const text = 'Go to https://dup.com now';
    const entities = [new MockMessageEntityUrl({ offset: 6, length: 15 })];
    const links = extractLinks(text, entities as any);
    // https://dup.com appears both in entity and regex, should appear once
    expect(links.filter((l) => l === 'https://dup.com')).toHaveLength(1);
  });

  it('returns empty array for text without URLs', () => {
    expect(extractLinks('no links here')).toEqual([]);
  });
});

describe('extractHashtags', () => {
  it('extracts hashtag entities', () => {
    const text = 'news #Tech update';
    const entities = [new MockMessageEntityHashtag({ offset: 5, length: 5 })];
    const tags = extractHashtags(text, entities as any);
    expect(tags).toContain('#tech'); // lowercased
  });

  it('extracts hashtags from plain text via regex', () => {
    const text = 'Hello #World #test';
    const tags = extractHashtags(text);
    expect(tags).toContain('#world');
    expect(tags).toContain('#test');
  });

  it('deduplicates entity and regex hashtags', () => {
    const text = 'Tag #Dupe here';
    const entities = [new MockMessageEntityHashtag({ offset: 4, length: 5 })];
    const tags = extractHashtags(text, entities as any);
    expect(tags.filter((t) => t === '#dupe')).toHaveLength(1);
  });

  it('handles Cyrillic hashtags', () => {
    const text = '#новости about things';
    const tags = extractHashtags(text);
    expect(tags).toContain('#новости');
  });

  it('returns empty array for text without hashtags', () => {
    expect(extractHashtags('no tags')).toEqual([]);
  });
});

describe('parseMessageFields', () => {
  function makeMsg(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      message: 'hello',
      date: 1700000000,
      entities: undefined,
      media: undefined,
      groupedId: undefined,
      ...overrides,
    } as any;
  }

  it('returns null when message has no text and no media', () => {
    const result = parseMessageFields(makeMsg({ message: '', media: undefined }), 'test_channel');
    expect(result).toBeNull();
  });

  it('parses basic text message', () => {
    const result = parseMessageFields(makeMsg({ message: 'hello world' }), 'ch');
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.message).toBe('hello world');
    expect(result!.date).toBe(1700000000);
    expect(result!.mediaType).toBeUndefined();
  });

  it('parses photo media', () => {
    const photo = new MockPhoto(1, [new MockPhotoSize(5000), new MockPhotoSize(100)]);
    const media = Object.assign(new MockMessageMediaPhoto(), { photo });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.mediaType).toBe('photo');
    expect(result!.mediaSizeBytes).toBe(5000); // largest
  });

  it('parses document media with audio mime', () => {
    const doc = new MockDocument({ size: BigInt(1024), mimeType: 'audio/mpeg' });
    const media = Object.assign(new MockMessageMediaDocument(), { document: doc });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.mediaType).toBe('audio');
    expect(result!.mediaSizeBytes).toBe(1024);
  });

  it('parses document media with video mime as video', () => {
    const doc = new MockDocument({ size: BigInt(2048), mimeType: 'video/mp4' });
    const media = Object.assign(new MockMessageMediaDocument(), { document: doc });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.mediaType).toBe('video');
  });

  it('parses document media with non-audio non-video mime as document', () => {
    const doc = new MockDocument({ size: BigInt(2048), mimeType: 'application/pdf' });
    const media = Object.assign(new MockMessageMediaDocument(), { document: doc });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.mediaType).toBe('document');
  });

  it('detects video via DocumentAttributeVideo even with a generic mime', () => {
    const doc = new MockDocument({
      size: BigInt(2048),
      mimeType: 'application/octet-stream',
      attributes: [new MockDocumentAttributeVideo()],
    });
    const media = Object.assign(new MockMessageMediaDocument(), { document: doc });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.mediaType).toBe('video');
  });

  it('detects audio via DocumentAttributeAudio even with a generic mime', () => {
    const doc = new MockDocument({
      size: BigInt(2048),
      mimeType: 'application/octet-stream',
      attributes: [new MockDocumentAttributeAudio()],
    });
    const media = Object.assign(new MockMessageMediaDocument(), { document: doc });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.mediaType).toBe('audio');
  });

  it('detects video via file extension when mime and attributes are ambiguous', () => {
    const doc = new MockDocument({
      size: BigInt(2048),
      mimeType: 'application/octet-stream',
      attributes: [new MockDocumentAttributeFilename({ fileName: 'clip.mkv' })],
    });
    const media = Object.assign(new MockMessageMediaDocument(), { document: doc });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.mediaType).toBe('video');
  });

  it('parses webpage media', () => {
    const wp = new MockWebPage(undefined);
    const media = Object.assign(new MockMessageMediaWebPage(), { webpage: wp });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.mediaType).toBe('webpage');
    expect(result!.instantViewContent).toBeUndefined();
  });

  it('extracts Instant View content from webpage', () => {
    const paragraph = new MockPageBlockParagraph(new MockTextPlain('Article body'));
    const page = new MockPage([paragraph]);
    const wp = new MockWebPage(page);
    const media = Object.assign(new MockMessageMediaWebPage(), { webpage: wp });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.instantViewContent).toBe('Article body');
  });

  it('extracts text from unknown container blocks with .blocks (fallback)', () => {
    // Simulates PageBlockCover, PageBlockCollage, or any container with nested blocks
    const inner = new MockPageBlockParagraph(new MockTextPlain('Inside container'));
    const container = { blocks: [inner] }; // unknown block type with .blocks
    const page = new MockPage([container]);
    const wp = new MockWebPage(page);
    const media = Object.assign(new MockMessageMediaWebPage(), { webpage: wp });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.instantViewContent).toContain('Inside container');
  });

  it('extracts text from unknown blocks with .text property (fallback)', () => {
    // Simulates an unhandled block type that has a .text field
    const unknownBlock = { text: new MockTextPlain('Fallback text') };
    const page = new MockPage([unknownBlock]);
    const wp = new MockWebPage(page);
    const media = Object.assign(new MockMessageMediaWebPage(), { webpage: wp });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.instantViewContent).toContain('Fallback text');
  });

  it('extracts caption from blocks with .caption (PageBlockPhoto, PageBlockEmbed, etc.)', () => {
    const captionBlock = { caption: { text: new MockTextPlain('Photo caption') } };
    const page = new MockPage([captionBlock]);
    const wp = new MockWebPage(page);
    const media = Object.assign(new MockMessageMediaWebPage(), { webpage: wp });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.instantViewContent).toContain('Photo caption');
  });

  it('preserves text after an embed block in Instant View', () => {
    // Simulates: paragraph → embed (unknown type) → paragraph
    const before = new MockPageBlockParagraph(new MockTextPlain('Before embed'));
    const embed = { caption: { text: new MockTextPlain('Embed caption') } };
    const after = new MockPageBlockParagraph(new MockTextPlain('After embed'));
    const page = new MockPage([before, embed, after]);
    const wp = new MockWebPage(page);
    const media = Object.assign(new MockMessageMediaWebPage(), { webpage: wp });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.instantViewContent).toContain('Before embed');
    expect(result!.instantViewContent).toContain('After embed');
  });

  it('returns null for unsupported media types', () => {
    // Any media that's not Photo/Document/WebPage
    const media = { someField: true };
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result).toBeNull();
  });

  it('includes groupedId as string when present', () => {
    const result = parseMessageFields(makeMsg({ groupedId: BigInt(12345) }), 'ch');
    expect(result!.groupedId).toBe('12345');
  });

  it('sets rawMedia from message', () => {
    const photo = new MockPhoto(1, []);
    const media = Object.assign(new MockMessageMediaPhoto(), { photo });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.rawMedia).toBe(media);
  });

  it('sets instantViewPartial and instantViewUrl when cachedPage.part is true', () => {
    const paragraph = new MockPageBlockParagraph(new MockTextPlain('Partial text'));
    const page = new MockPage([paragraph], true); // part = true
    const wp = new MockWebPage(page, 'https://example.com/article');
    const media = Object.assign(new MockMessageMediaWebPage(), { webpage: wp });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.instantViewPartial).toBe(true);
    expect(result!.instantViewUrl).toBe('https://example.com/article');
    // Still extracts partial content as fallback
    expect(result!.instantViewContent).toBe('Partial text');
  });

  it('does not set instantViewPartial when cachedPage.part is false', () => {
    const paragraph = new MockPageBlockParagraph(new MockTextPlain('Full text'));
    const page = new MockPage([paragraph], false);
    const wp = new MockWebPage(page, 'https://example.com/article');
    const media = Object.assign(new MockMessageMediaWebPage(), { webpage: wp });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.instantViewPartial).toBeUndefined();
    expect(result!.instantViewUrl).toBeUndefined();
    expect(result!.instantViewContent).toBe('Full text');
  });
});

describe('extractInstantViewText', () => {
  it('extracts title as markdown heading', () => {
    const blocks = [new MockPageBlockTitle(new MockTextPlain('Title'))];
    expect(extractInstantViewText(blocks as any)).toBe('# Title');
  });

  it('extracts subtitle as italic', () => {
    const blocks = [new MockPageBlockSubtitle(new MockTextPlain('Sub'))];
    expect(extractInstantViewText(blocks as any)).toBe('_Sub_');
  });

  it('extracts kicker as italic', () => {
    const blocks = [new MockPageBlockKicker(new MockTextPlain('Kicker'))];
    expect(extractInstantViewText(blocks as any)).toBe('_Kicker_');
  });

  it('extracts header as ## heading', () => {
    const blocks = [new MockPageBlockHeader(new MockTextPlain('H2'))];
    expect(extractInstantViewText(blocks as any)).toBe('## H2');
  });

  it('extracts subheader as ### heading', () => {
    const blocks = [new MockPageBlockSubheader(new MockTextPlain('H3'))];
    expect(extractInstantViewText(blocks as any)).toBe('### H3');
  });

  it('extracts paragraph and footer as plain text', () => {
    const blocks = [
      new MockPageBlockParagraph(new MockTextPlain('Body')),
      new MockPageBlockFooter(new MockTextPlain('Foot')),
    ];
    expect(extractInstantViewText(blocks as any)).toBe('Body\n\nFoot');
  });

  it('extracts preformatted as code block', () => {
    const blocks = [new MockPageBlockPreformatted(new MockTextPlain('code()'))];
    expect(extractInstantViewText(blocks as any)).toBe('```\ncode()\n```');
  });

  it('extracts divider as ---', () => {
    const blocks = [new MockPageBlockDivider()];
    expect(extractInstantViewText(blocks as any)).toBe('---');
  });

  it('extracts blockquote and pullquote', () => {
    const blocks = [
      new MockPageBlockBlockquote(new MockTextPlain('Quote 1')),
      new MockPageBlockPullquote(new MockTextPlain('Quote 2')),
    ];
    expect(extractInstantViewText(blocks as any)).toBe('> Quote 1\n\n> Quote 2');
  });

  it('extracts unordered list items', () => {
    const blocks = [
      new MockPageBlockList([
        new MockPageListItemText(new MockTextPlain('Item A')),
        new MockPageListItemText(new MockTextPlain('Item B')),
      ]),
    ];
    expect(extractInstantViewText(blocks as any)).toBe('- Item A\n\n- Item B');
  });

  it('extracts unordered list with nested blocks', () => {
    const inner = new MockPageBlockParagraph(new MockTextPlain('Nested'));
    const blocks = [new MockPageBlockList([new MockPageListItemBlocks([inner])])];
    expect(extractInstantViewText(blocks as any)).toBe('- Nested');
  });

  it('extracts ordered list items', () => {
    const blocks = [
      new MockPageBlockOrderedList([
        new MockPageListOrderedItemText(new MockTextPlain('First')),
        new MockPageListOrderedItemText(new MockTextPlain('Second')),
      ]),
    ];
    expect(extractInstantViewText(blocks as any)).toBe('1. First\n\n2. Second');
  });

  it('extracts ordered list with nested blocks', () => {
    const inner = new MockPageBlockParagraph(new MockTextPlain('Sub'));
    const blocks = [new MockPageBlockOrderedList([new MockPageListOrderedItemBlocks([inner])])];
    expect(extractInstantViewText(blocks as any)).toBe('1. Sub');
  });

  it('extracts details block with title and nested blocks', () => {
    const inner = new MockPageBlockParagraph(new MockTextPlain('Detail body'));
    const blocks = [new MockPageBlockDetails(new MockTextPlain('Summary'), [inner])];
    expect(extractInstantViewText(blocks as any)).toBe('### Summary\n\nDetail body');
  });

  it('skips blocks with empty text', () => {
    const blocks = [
      new MockPageBlockTitle(new MockTextPlain('  ')),
      new MockPageBlockParagraph(new MockTextPlain('Real')),
    ];
    expect(extractInstantViewText(blocks as any)).toBe('Real');
  });

  it('handles TextConcat rich text', () => {
    const concat = new MockTextConcat([new MockTextPlain('Hello '), new MockTextPlain('World')]);
    const blocks = [new MockPageBlockParagraph(concat)];
    expect(extractInstantViewText(blocks as any)).toBe('Hello World');
  });

  it('handles TextImage as empty string', () => {
    const blocks = [new MockPageBlockParagraph(new MockTextImage())];
    expect(extractInstantViewText(blocks as any)).toBe('');
  });

  it('handles TextEmpty as empty string', () => {
    const blocks = [new MockPageBlockParagraph(new MockTextEmpty())];
    expect(extractInstantViewText(blocks as any)).toBe('');
  });

  it('handles wrapped rich text with nested .text property', () => {
    // Simulates TextBold, TextItalic, etc. — have a .text sub-field
    const wrapped = { text: new MockTextPlain('bold text') };
    const blocks = [new MockPageBlockParagraph(wrapped)];
    expect(extractInstantViewText(blocks as any)).toBe('bold text');
  });

  it('handles wrapped rich text with no .text property', () => {
    const wrapped = { someOther: 'field' };
    const blocks = [new MockPageBlockParagraph(wrapped)];
    expect(extractInstantViewText(blocks as any)).toBe('');
  });

  it('renders bold rich text with ** markers', () => {
    const blocks = [new MockPageBlockParagraph(new MockTextBold(new MockTextPlain('strong')))];
    expect(extractInstantViewText(blocks as any)).toBe('**strong**');
  });

  it('renders italic rich text with _ markers', () => {
    const blocks = [new MockPageBlockParagraph(new MockTextItalic(new MockTextPlain('em')))];
    expect(extractInstantViewText(blocks as any)).toBe('_em_');
  });

  it('renders strikethrough rich text with ~~ markers', () => {
    const blocks = [new MockPageBlockParagraph(new MockTextStrike(new MockTextPlain('gone')))];
    expect(extractInstantViewText(blocks as any)).toBe('~~gone~~');
  });

  it('renders monospace rich text with backticks', () => {
    const blocks = [new MockPageBlockParagraph(new MockTextFixed(new MockTextPlain('code')))];
    expect(extractInstantViewText(blocks as any)).toBe('`code`');
  });

  it('renders hyperlink rich text as a markdown link (preserving the URL)', () => {
    const link = new MockTextUrl(new MockTextPlain('site'), 'https://example.com');
    const blocks = [new MockPageBlockParagraph(link)];
    expect(extractInstantViewText(blocks as any)).toBe('[site](https://example.com)');
  });

  it('renders email rich text as a mailto link', () => {
    const email = new MockTextEmail(new MockTextPlain('mail me'), 'a@b.com');
    const blocks = [new MockPageBlockParagraph(email)];
    expect(extractInstantViewText(blocks as any)).toBe('[mail me](mailto:a@b.com)');
  });

  it('combines nested bold + link inside a concat', () => {
    const concat = new MockTextConcat([
      new MockTextPlain('See '),
      new MockTextBold(new MockTextUrl(new MockTextPlain('here'), 'https://x.io')),
    ]);
    const blocks = [new MockPageBlockParagraph(concat)];
    expect(extractInstantViewText(blocks as any)).toBe('See **[here](https://x.io)**');
  });

  it('renders a table as GitHub-flavoured markdown', () => {
    const table = new MockPageBlockTable([
      { cells: [{ text: new MockTextPlain('A') }, { text: new MockTextPlain('B') }] },
      { cells: [{ text: new MockTextPlain('1') }, { text: new MockTextPlain('2') }] },
    ]);
    expect(extractInstantViewText([table] as any)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });

  it('renders author/date as italic', () => {
    const blocks = [new MockPageBlockAuthorDate(new MockTextPlain('Jane Doe'))];
    expect(extractInstantViewText(blocks as any)).toBe('_Jane Doe_');
  });
});

describe('extractInstantViewPage', () => {
  it('resolves a PageBlockPhoto to a markdown image placeholder + image ref', () => {
    const photo = new MockPhoto(555, []);
    const photoBlock = new MockPageBlockPhoto(555, { text: new MockTextPlain('A caption') });
    const page = new MockPage([photoBlock], false, [photo]);
    const { text, images } = extractInstantViewPage(page as any);
    expect(text).toBe('![A caption](iv://0)');
    expect(images).toHaveLength(1);
    expect(images[0].placeholder).toBe('iv://0');
    expect(images[0].media).toBe(photo);
  });

  it('falls back to caption-only when the photo is missing from the page', () => {
    const photoBlock = new MockPageBlockPhoto(999, { text: new MockTextPlain('Just caption') });
    const page = new MockPage([photoBlock], false, []); // no photos
    const { text, images } = extractInstantViewPage(page as any);
    expect(text).toBe('Just caption');
    expect(images).toHaveLength(0);
  });

  it('numbers multiple images sequentially', () => {
    const p1 = new MockPhoto(1, []);
    const p2 = new MockPhoto(2, []);
    const page = new MockPage(
      [new MockPageBlockPhoto(1), new MockPageBlockParagraph(new MockTextPlain('mid')), new MockPageBlockPhoto(2)],
      false,
      [p1, p2],
    );
    const { text, images } = extractInstantViewPage(page as any);
    expect(text).toBe('![](iv://0)\n\nmid\n\n![](iv://1)');
    expect(images.map((i) => i.placeholder)).toEqual(['iv://0', 'iv://1']);
  });
});

describe('parseMessageFields — document fallback', () => {
  function makeMsg(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      message: 'hello',
      date: 1700000000,
      entities: undefined,
      media: undefined,
      groupedId: undefined,
      ...overrides,
    } as any;
  }

  it('sets mediaType to document when document object is not a Document instance', () => {
    // msg.media.document is not instanceof _Api.Document (e.g. DocumentEmpty)
    const media = Object.assign(new MockMessageMediaDocument(), { document: {} });
    const result = parseMessageFields(makeMsg({ media }), 'ch');
    expect(result!.mediaType).toBe('document');
    expect(result!.mediaSizeBytes).toBeUndefined();
  });
});
