// Copyright 2018 The Outline Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {JsonConfig} from '../infrastructure/json_config';
import {PrometheusClient} from '../infrastructure/prometheus_scraper';
import {AccessKeyId} from '../model/access_key';
import {DataUsageByUser} from '../model/metrics';

// Serialized format for the manager metrics.
// WARNING: Renaming fields will break backwards-compatibility.
export interface ManagerMetricsJson {
  // Bytes per user per day. The key encodes the user+day in the form "userId-dateInYYYYMMDD".
  dailyUserBytesTransferred?: Array<[string, number]>;
  // Set of all User IDs for whom we have transfer metrics.
  // TODO: Delete userIdSet. It can be derived from dailyUserBytesTransferred.
  userIdSet?: string[];
}

// ManagerMetrics keeps track of the number of bytes transferred per user, per day.
// Surfaced by the manager service to display on the Manager UI.
// TODO: Remove entries older than 30d.
export class ManagerMetrics {
  constructor(
      private prometheusClient: PrometheusClient,
      private legacyConfig: JsonConfig<ManagerMetricsJson>) {}

  public async get30DayByteTransfer(): Promise<DataUsageByUser> {
    // We currently only show the data that leaves the proxy, since that's what DigitalOcean
    // measures.
    const result = await this.prometheusClient.query(
        'sum(increase(shadowsocks_data_bytes{dir=~"c<p|p>t|>p<"}[30d])) by (access_key)');
    const usage = {} as {[userId: string]: number};
    for (const entry of result.result) {
      usage[entry.metric['access_key'] || ''] = parseFloat(entry.value[1]);
    }

    // TODO: Remove this after 30 days of everyone being migrated, since we won't need the config
    // file anymore.
    this.addLegacyUsageData(usage);

    return {bytesTransferredByUserId: usage};
  }

  // Gets the legacy 30 day usage from the config file.
  private addLegacyUsageData(usage: {[userId: string]: number}) {
    if (!this.legacyConfig || !this.legacyConfig.data() ||
        !this.legacyConfig.data().dailyUserBytesTransferred) {
      return;
    }
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    for (const entry of this.legacyConfig.data().dailyUserBytesTransferred) {
      const parsed = parseEntry(entry);
      if (parsed.day < startDate) {
        continue;
      }
      usage[parsed.accessKey] += parsed.bytes;
    }
  }
}

export function parseEntry(entry: [string, number]): {accessKey: string, day: Date, bytes: number} {
  const matches = entry[0].match(/(.+)-([0-9]{4})([0-9]{2})([0-9]{2})/);
  if (matches.length !== 5) {
    throw Error(`Found ${matches.length - 1} parts in key ${entry[0]}`);
  }
  const day = new Date(`${matches[2]}-${matches[3]}-${matches[4]}`);
  return {accessKey: matches[1], day, bytes: entry[1]};
}