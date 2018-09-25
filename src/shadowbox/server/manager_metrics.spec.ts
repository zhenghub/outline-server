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

import {InMemoryConfig} from '../infrastructure/json_config';

import {ManagerMetrics, ManagerMetricsJson, parseEntry} from './manager_metrics';

function addDays(baseDate: Date, days: number) {
  const date = new Date(baseDate);
  date.setDate(baseDate.getDate() + days);
  return date;
}

describe('ManagerMetrics', () => {
  describe('parseKey', () => {
    it('Gets the access key and date', () => {
      const parsed = parseEntry(['user-1-20170816', 123]);
      expect(parsed.accessKey).toEqual('user-1');
      expect(parsed.day).toEqual(new Date('2017-08-16'));
      expect(parsed.bytes).toEqual(123);
    });
  });
});
