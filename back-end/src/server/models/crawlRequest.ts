import { JSONSchemaType } from 'ajv';

export interface CrawlRequestBody {
  urls: string[];
}

export const crawlRequestSchema: JSONSchemaType<CrawlRequestBody> = {
  type: 'object',
  properties: {
    urls: {
      type: 'array',
      items: {
        type: 'string',
        format: 'uri',
        pattern: '^https?://',
      },
    },
  },
  required: ['urls'],
  additionalProperties: false,
};
