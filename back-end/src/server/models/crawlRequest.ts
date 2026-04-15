import { JSONSchemaType } from 'ajv';

export interface CrawlTarget {
  url: string;
  callbackUrl: string;
}

export interface CrawlRequestBody {
  urls: CrawlTarget[];
}

export const crawlRequestSchema: JSONSchemaType<CrawlRequestBody> = {
  type: 'object',
  properties: {
    urls: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            format: 'uri',
            pattern: '^https?://',
          },
          callbackUrl: {
            type: 'string',
            format: 'uri',
            pattern: '^https?://',
          },
        },
        required: ['url', 'callbackUrl'],
        additionalProperties: false,
      },
    },
  },
  required: ['urls'],
  additionalProperties: false,
};
