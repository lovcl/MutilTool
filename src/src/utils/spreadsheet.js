import { normalizeDateText, normalizeTimeText } from './time';

export const parseCsvRows = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && (char === ',' || char === '\t')) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      row.push(cell.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
};

export const parseHtmlTableRows = (text) => {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const rows = Array.from(doc.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th,td')).map((cell) => cell.textContent.trim())
  );

  return rows.filter((row) => row.some(Boolean));
};

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const getExcelColumnName = (columnIndex) => {
  let index = columnIndex + 1;
  let name = '';

  while (index > 0) {
    const remainder = (index - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    index = Math.floor((index - 1) / 26);
  }

  return name;
};

const getExcelColumnIndex = (cellRef) => {
  const columnName = String(cellRef || '').match(/[A-Z]+/)?.[0] || '';
  return columnName.split('').reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1;
};

const createCrc32Table = () =>
  Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });

const crc32Table = createCrc32Table();

const getCrc32 = (bytes) => {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
};

const writeUint16 = (bytes, value) => {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
};

const writeUint32 = (bytes, value) => {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
};

const createZipBlob = (files) => {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const crc = getCrc32(contentBytes);
    const localHeader = [];

    writeUint32(localHeader, 0x04034b50);
    writeUint16(localHeader, 20);
    writeUint16(localHeader, 0x0800);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint32(localHeader, crc);
    writeUint32(localHeader, contentBytes.length);
    writeUint32(localHeader, contentBytes.length);
    writeUint16(localHeader, nameBytes.length);
    writeUint16(localHeader, 0);

    localParts.push(new Uint8Array(localHeader), nameBytes, contentBytes);

    const centralHeader = [];
    writeUint32(centralHeader, 0x02014b50);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 0x0800);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, crc);
    writeUint32(centralHeader, contentBytes.length);
    writeUint32(centralHeader, contentBytes.length);
    writeUint16(centralHeader, nameBytes.length);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, 0);
    writeUint32(centralHeader, offset);

    centralParts.push(new Uint8Array(centralHeader), nameBytes);
    offset += localHeader.length + nameBytes.length + contentBytes.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = [];
  writeUint32(endRecord, 0x06054b50);
  writeUint16(endRecord, 0);
  writeUint16(endRecord, 0);
  writeUint16(endRecord, files.length);
  writeUint16(endRecord, files.length);
  writeUint32(endRecord, centralSize);
  writeUint32(endRecord, offset);
  writeUint16(endRecord, 0);

  return new Blob([...localParts, ...centralParts, new Uint8Array(endRecord)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

const createWorksheetXml = (rows) => {
  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          const cellRef = `${getExcelColumnName(columnIndex)}${rowIndex + 1}`;
          return `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
        })
        .join('');

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>
    <col min="1" max="1" width="14" customWidth="1"/>
    <col min="2" max="2" width="16" customWidth="1"/>
    <col min="3" max="4" width="12" customWidth="1"/>
    <col min="5" max="9" width="14" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
};

export const createXlsxBlob = (rows) =>
  createZipBlob([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="考勤绩效" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: createWorksheetXml(rows),
    },
  ]);

export const getRowsFromAttendanceFile = (text) => {
  if (/<table[\s>]/i.test(text)) {
    return parseHtmlTableRows(text);
  }

  return parseCsvRows(text);
};

const readUint16 = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
const readUint32 = (bytes, offset) =>
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

const inflateRawBytes = async (bytes) => {
  if (!window.DecompressionStream) {
    throw new Error('当前运行环境不支持解压压缩的 xlsx 文件');
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const unzipXlsxFiles = async (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  const decoder = new TextDecoder();
  const files = {};
  let offset = 0;

  while (offset < bytes.length - 4) {
    const signature = readUint32(bytes, offset);
    if (signature !== 0x04034b50) {
      break;
    }

    const flags = readUint16(bytes, offset + 6);
    const method = readUint16(bytes, offset + 8);
    const compressedSize = readUint32(bytes, offset + 18);
    const fileNameLength = readUint16(bytes, offset + 26);
    const extraLength = readUint16(bytes, offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));

    if (flags & 0x08) {
      throw new Error('暂不支持带数据描述符的 xlsx 文件');
    }

    const compressedBytes = bytes.slice(dataStart, dataStart + compressedSize);
    let contentBytes = compressedBytes;
    if (method === 8) {
      contentBytes = await inflateRawBytes(compressedBytes);
    } else if (method !== 0) {
      throw new Error('暂不支持该 xlsx 压缩方式');
    }

    files[name] = decoder.decode(contentBytes);
    offset = dataStart + compressedSize;
  }

  return files;
};

const parseSharedStrings = (xml) => {
  if (!xml) {
    return [];
  }

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('si')).map((si) =>
    Array.from(si.getElementsByTagName('t')).map((node) => node.textContent || '').join('')
  );
};

export const parseXlsxRows = async (arrayBuffer) => {
  const files = await unzipXlsxFiles(arrayBuffer);
  const sheetXml = files['xl/worksheets/sheet1.xml'];
  if (!sheetXml) {
    return [];
  }

  const sharedStrings = parseSharedStrings(files['xl/sharedStrings.xml']);
  const doc = new DOMParser().parseFromString(sheetXml, 'application/xml');

  return Array.from(doc.getElementsByTagName('row'))
    .map((row) => {
      const rowValues = [];
      Array.from(row.getElementsByTagName('c')).forEach((cell, fallbackIndex) => {
        const type = cell.getAttribute('t');
        const inlineText = cell.getElementsByTagName('t')[0]?.textContent;
        const columnIndex = Math.max(0, getExcelColumnIndex(cell.getAttribute('r')) || fallbackIndex);
        let value = '';

        if (inlineText != null) {
          value = inlineText.trim();
        } else {
          const rawValue = cell.getElementsByTagName('v')[0]?.textContent || '';
          if (type === 's') {
            value = (sharedStrings[Number(rawValue)] || '').trim();
          } else if (type === 'd') {
            value = rawValue.trim().slice(0, 10);
          } else {
            value = rawValue.trim();
          }
        }

        rowValues[columnIndex] = value;
      });

      return rowValues.map((value) => value || '');
    })
    .filter((row) => row.some(Boolean));
};

export const rowsToObjects = (rows) => {
  if (!rows.length) {
    return [];
  }

  const firstRowIsData = Boolean(normalizeDateText(rows[0][0]));
  const headerlessSimpleAttendance = firstRowIsData && Boolean(normalizeTimeText(rows[0][1]));
  const headers = firstRowIsData
    ? headerlessSimpleAttendance
      ? ['日期', '上班打卡', '下班打卡', '出勤类型']
      : [
          '日期',
          '日期类型',
          '上班打卡',
          '下班打卡',
          '出勤类型',
          '绩效小时',
          '考勤状态',
          '迟到分钟',
          '请假小时',
          '来源',
        ]
    : rows[0].map((header) => header.replace(/^\ufeff/, '').trim());
  const dataRows = firstRowIsData ? rows : rows.slice(1);

  return dataRows.map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = row[index] ?? '';
    });
    item.__row = row;
    return item;
  });
};

export const attendanceImportColumns = {
  date: ['日期', '打卡日期', '考勤日期', 'Date', 'date'],
  startTime: ['上班打卡', '上班时间', '开始时间', '打卡开始', '签到时间', 'Start', 'start'],
  endTime: ['下班打卡', '下班时间', '结束时间', '打卡结束', '签退时间', 'End', 'end'],
  dayMode: ['出勤类型', 'dayMode', 'mode'],
};

export const pickImportValue = (item, keys, fallbackIndex = -1) => {
  const foundKey = keys.find((key) => String(item[key] ?? '').trim());
  if (foundKey) {
    return item[foundKey];
  }

  return fallbackIndex >= 0 ? item.__row?.[fallbackIndex] : '';
};
