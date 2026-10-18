---
id: local-poster
name: Local Poster
description: 用于本地扫描验收的海报 Skill。
category: 海报
version: 1.2.0
author: Skill Canvas Test Fixture
inputs:
  - id: prompt
    label: 提示词
    type: 文本
    required: true
  - id: reference
    label: 参考图
    type: 图片
outputs: [PNG]
runtime:
  compatible: true
dependencies:
  - name: assets/palette.txt
    type: file
parameters:
  - id: style_strength
    type: range
    label: 风格强度
    min: 0
    max: 100
    default: 65
  - id: palette
    type: select
    label: 配色
    options: [克制, 鲜明]
    default: 克制
  - id: keep_subject
    type: boolean
    label: 保留主体
    default: true
  - id: iterations
    type: number
    label: 迭代次数
    min: 1
    max: 10
    default: 3
  - id: caption
    type: text
    label: 画面标题
    default: 未命名
---
# Local Poster

此文件仅用于验证目录扫描和参数解析，不会执行任何命令。

## 使用说明
提供提示词和可选参考图。该测试 Skill 没有真实生成案例。
