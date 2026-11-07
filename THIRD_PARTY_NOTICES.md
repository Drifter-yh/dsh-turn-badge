# Third-Party Notices

`dsh-turn-badge` is MIT-licensed and ships **no third-party runtime
dependencies**. It uses only browser APIs and the documented DeepSeek Harness
client-plugin contract.

## DeepSeek Harness — MIT

- Upstream: <https://github.com/deepseek-ai/deepseek-harness>
- Used for: the client-plugin envelope (`window.__ModuleLoader__.load`), the
  `dsh.client` / `dsh.bundle` package manifest fields, and the documented
  Cordis services `uiSession` and `sessions`. No Harness source code is copied
  into this package.

```text
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Design references

The packaging conventions (dual README, manifest shape, CI/release split) were
checked against the MIT-licensed
[`@drifter-yh/dsh-think-summary`](https://github.com/Drifter-yh/dsh-think-summary).
No code from that project is included; the client bundle here is an independent
implementation.
