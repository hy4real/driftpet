#!/usr/bin/env bash
# workflow-portable init
#
# 用法：
#   bash workflow-portable/init.sh                            # 交互式
#   bash workflow-portable/init.sh --dry-run                  # 只预览不写
#   bash workflow-portable/init.sh --unattended <conf>        # 用配置文件，无交互
#   bash workflow-portable/init.sh --unattended <conf> --force # 自动覆盖冲突
#   bash workflow-portable/init.sh --help

set -euo pipefail

# ============================================================
# CLI 参数
# ============================================================
DRY_RUN=n
CONFIG_FILE=""
FORCE=n

print_help() {
  cat <<EOF
workflow-portable init

Usage:
  bash workflow-portable/init.sh [options]

Options:
  --dry-run              只预览将要写的文件，不实际写入
  --unattended <file>    从配置文件读取所有字段，跳过交互
  --force                与 --unattended 配合：遇到冲突文件自动覆盖（默认跳过）
  -h, --help             显示本帮助

Examples:
  # 交互式
  bash workflow-portable/init.sh

  # 看一眼会创建什么，不写文件
  bash workflow-portable/init.sh --dry-run

  # CI 场景
  bash workflow-portable/init.sh --unattended .workflow-init.conf

  # CI 强制覆盖
  bash workflow-portable/init.sh --unattended .workflow-init.conf --force

Config file format: see workflow-portable/.workflow-init.conf.example
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)        DRY_RUN=y; shift ;;
    --force)          FORCE=y; shift ;;
    --unattended)     CONFIG_FILE="${2:?--unattended needs a file path}"; shift 2 ;;
    --unattended=*)   CONFIG_FILE="${1#*=}"; shift ;;
    -h|--help)        print_help; exit 0 ;;
    *)                echo "ERROR: unknown arg: $1" >&2; print_help; exit 1 ;;
  esac
done

# ============================================================
# 路径检测
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$(pwd)"

if [[ "$TARGET_DIR" == "$SCRIPT_DIR" || "$TARGET_DIR" == "$SCRIPT_DIR"/* ]]; then
  echo "ERROR: 不要在 workflow-portable/ 内部运行 init.sh"
  echo ""
  echo "正确用法："
  echo "  cd /path/to/your-new-repo"
  echo "  bash workflow-portable/init.sh"
  exit 1
fi

if [[ ! -f "$SCRIPT_DIR/CLAUDE.md.template" ]]; then
  echo "ERROR: 找不到 $SCRIPT_DIR/CLAUDE.md.template"
  echo "workflow-portable/ 文件夹结构损坏？"
  exit 1
fi

# ============================================================
# 工具函数
# ============================================================
to_lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

ask() {
  local prompt="$1"
  local default="${2:-}"
  local var=""
  if [[ -n "$default" ]]; then
    printf '%s [%s]: ' "$prompt" "$default" >&2
    read -r var
    printf '%s' "${var:-$default}"
  else
    while [[ -z "$var" ]]; do
      printf '%s: ' "$prompt" >&2
      read -r var
      [[ -z "$var" ]] && printf '(必填)\n' >&2
    done
    printf '%s' "$var"
  fi
}

# ask_optional：留空回车 = 跳过（返回空串）
ask_optional() {
  local prompt="$1"
  local var=""
  printf '%s [回车跳过]: ' "$prompt" >&2
  read -r var
  printf '%s' "$var"
}

ask_yes_no() {
  local prompt="$1"
  local default="${2:-Y}"
  local var=""
  printf '%s [%s/%s]: ' "$prompt" \
    "$([ "$default" = "Y" ] && echo "Y" || echo "y")" \
    "$([ "$default" = "Y" ] && echo "n" || echo "N")" >&2
  read -r var
  var="${var:-$default}"
  case "$(to_lower "$var")" in
    y|yes) printf 'y' ;;
    *)     printf 'n' ;;
  esac
}

replace_in_file() {
  local file="$1"
  local key="$2"
  local value="$3"
  local escaped tmp
  escaped=$(printf '%s' "$value" | sed -e 's/[&|\\]/\\&/g')
  tmp=$(mktemp)
  sed "s|{{${key}}}|${escaped}|g" "$file" > "$tmp"
  mv "$tmp" "$file"
}

replace_line_in_file() {
  local file="$1"
  local pattern="$2"
  local new_line="$3"
  local tmp
  tmp=$(mktemp)
  awk -v pat="$pattern" -v new="$new_line" '
    $0 ~ pat { print new; next }
    { print }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

# 写动作的 dry-run 包装
do_write() {
  local desc="$1"
  shift
  if [[ "$DRY_RUN" == "y" ]]; then
    echo "[dry] $desc"
  else
    "$@"
  fi
}

check_conflict() {
  local file="$1"
  if [[ -e "$file" ]]; then
    if [[ -n "$CONFIG_FILE" ]]; then
      # unattended 模式
      if [[ "$FORCE" == "y" ]]; then
        local ts; ts=$(date +%s)
        do_write "backup $file -> $file.bak.$ts" cp "$file" "${file}.bak.${ts}"
        echo "    [unattended --force] 备份并覆盖 $file" >&2
        return 0
      else
        echo "    [unattended] 已存在，跳过 ${file}（用 --force 覆盖）" >&2
        return 1
      fi
    fi
    # 交互模式
    printf '[!] %s 已存在\n' "$file" >&2
    local resp
    resp=$(ask_yes_no "覆盖（旧文件备份为 .bak.<ts>）？" "N")
    if [[ "$resp" != "y" ]]; then
      printf '    跳过 %s\n' "$file" >&2
      return 1
    fi
    local ts; ts=$(date +%s)
    do_write "backup $file -> $file.bak.$ts" cp "$file" "${file}.bak.${ts}"
    printf '    备份至 %s.bak.%s\n' "$file" "$ts" >&2
  fi
  return 0
}

# ============================================================
# 主流程
# ============================================================
echo "================================================"
echo "  workflow-portable init"
[[ "$DRY_RUN" == "y" ]] && echo "  >>> DRY RUN: 不会实际写文件 <<<"
echo "================================================"
echo "目标目录: $TARGET_DIR"
echo "源目录:   $SCRIPT_DIR"
[[ -n "$CONFIG_FILE" ]] && echo "配置文件: $CONFIG_FILE"
echo ""

# ---------- Git 仓库检测 ----------
if ! git -C "$TARGET_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[!] 当前目录不是 git 仓库"
  echo "    建议先 git init 再跑 init.sh，便于追踪生成的文件"
  if [[ -z "$CONFIG_FILE" ]]; then
    cont=$(ask_yes_no "继续？" "Y")
    [[ "$cont" != "y" ]] && { echo "已取消"; exit 0; }
  else
    echo "    [unattended] 继续"
  fi
  echo ""
fi

# ---------- 加载配置或交互 ----------
if [[ -n "$CONFIG_FILE" ]]; then
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "ERROR: 配置文件不存在: $CONFIG_FILE" >&2
    exit 1
  fi
  echo "加载配置: $CONFIG_FILE"
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"

  # 必填校验
  : "${PROJECT_NAME:?conf missing: PROJECT_NAME}"
  : "${PROJECT_TYPE:?conf missing: PROJECT_TYPE}"
  : "${PRIMARY_STACK:?conf missing: PRIMARY_STACK}"
  : "${VERIFY_COMMANDS:?conf missing: VERIFY_COMMANDS}"
  : "${ROLLBACK:?conf missing: ROLLBACK}"
  : "${CRITICAL_PATHS:?conf missing: CRITICAL_PATHS}"
  : "${LEVEL:?conf missing: LEVEL}"
  : "${USE_SDD:?conf missing: USE_SDD}"

  # 选填默认
  CREATE_FIRST_SPEC="${CREATE_FIRST_SPEC:-n}"
  FIRST_SPEC_NAME="${FIRST_SPEC_NAME:-}"
  PRINCIPLE_1_NAME="${PRINCIPLE_1_NAME:-}"
  PRINCIPLE_2_NAME="${PRINCIPLE_2_NAME:-}"
  PRINCIPLE_3_NAME="${PRINCIPLE_3_NAME:-}"
  NON_NEGOTIABLE_1="${NON_NEGOTIABLE_1:-}"
  NON_NEGOTIABLE_2="${NON_NEGOTIABLE_2:-}"
  NON_NEGOTIABLE_3="${NON_NEGOTIABLE_3:-}"
  TEST_COVERAGE="${TEST_COVERAGE:-80}"

  if [[ "$CREATE_FIRST_SPEC" == "y" && -z "$FIRST_SPEC_NAME" ]]; then
    echo "ERROR: CREATE_FIRST_SPEC=y 但 FIRST_SPEC_NAME 未设置" >&2
    exit 1
  fi

  echo "[ok] 配置加载完成"
  echo ""
else
  # 交互模式
  echo "[1/4] 项目基本信息"
  echo "------------------------------------------------"
  DEFAULT_NAME=$(basename "$TARGET_DIR")
  PROJECT_NAME=$(ask "项目名" "$DEFAULT_NAME")
  PROJECT_TYPE=$(ask "项目类型 (Web应用/CLI工具/库/研究脚本/知识库)" "Web应用")
  PRIMARY_STACK=$(ask "主语言/技术栈" "TypeScript + Next.js")
  echo ""

  echo "[2/4] 验证与回滚"
  echo "------------------------------------------------"
  VERIFY_COMMANDS=$(ask "验证命令 (一行多条用 && 连接)" "pnpm test")
  ROLLBACK=$(ask "回滚方式" "git reset --hard HEAD")
  CRITICAL_PATHS=$(ask "关键路径 (Lite 模式触发用，逗号分隔)" "src/, app/")
  echo ""

  echo "[3/4] 接入选择"
  echo "------------------------------------------------"
  echo "  L0 = 单 agent / 个人项目"
  echo "  L1 = 多线程，无独立 QA"
  echo "  L2 = 多线程 + 独立 QA"
  echo "  L3 = 机器可读编排"
  LEVEL=""
  while [[ ! "$LEVEL" =~ ^[0-3]$ ]]; do
    LEVEL=$(ask "协议层级 (0/1/2/3)" "0")
  done
  USE_SDD=$(ask_yes_no "启用 SDD（创建 constitution.md）？" "Y")

  CREATE_FIRST_SPEC="n"
  FIRST_SPEC_NAME=""
  if [[ "$USE_SDD" == "y" ]]; then
    CREATE_FIRST_SPEC=$(ask_yes_no "顺便创建第一个 feature 的 spec/plan/tasks 三件套？" "N")
    if [[ "$CREATE_FIRST_SPEC" == "y" ]]; then
      FIRST_SPEC_NAME=$(ask "feature 名 (短横线分隔)" "user-auth")
    fi
  fi
  echo ""

  # SDD 启用时多收 7 个 constitution 字段
  PRINCIPLE_1_NAME=""
  PRINCIPLE_2_NAME=""
  PRINCIPLE_3_NAME=""
  NON_NEGOTIABLE_1=""
  NON_NEGOTIABLE_2=""
  NON_NEGOTIABLE_3=""
  TEST_COVERAGE="80"
  if [[ "$USE_SDD" == "y" ]]; then
    echo "[4/4] Constitution 关键内容（回车跳过的字段会保留 {{...}} 占位符待手填）"
    echo "------------------------------------------------"
    PRINCIPLE_1_NAME=$(ask_optional "核心原则 1 名字 (例如: 数据最小化)")
    PRINCIPLE_2_NAME=$(ask_optional "核心原则 2 名字")
    PRINCIPLE_3_NAME=$(ask_optional "核心原则 3 名字")
    NON_NEGOTIABLE_1=$(ask_optional "不可妥协项 1 (一句话 MUST NOT 形式)")
    NON_NEGOTIABLE_2=$(ask_optional "不可妥协项 2")
    NON_NEGOTIABLE_3=$(ask_optional "不可妥协项 3")
    TEST_COVERAGE=$(ask "测试覆盖率门槛 (%)" "80")
    echo ""
  else
    echo "[4/4] (跳过 constitution，未启用 SDD)"
    echo ""
  fi
fi

MULTI_THREAD="否"
[[ "$LEVEL" != "0" ]] && MULTI_THREAD="是"

# ---------- 预览 ----------
echo "================================================"
echo "  即将执行"
[[ "$DRY_RUN" == "y" ]] && echo "  >>> DRY RUN <<<"
echo "================================================"
echo "  [+] CLAUDE.md  (项目协议)"
[[ "$USE_SDD" == "y" ]] && echo "  [+] constitution.md  (项目宪法)"
if [[ "$CREATE_FIRST_SPEC" == "y" ]]; then
  echo "  [+] specs/0001-${FIRST_SPEC_NAME}/spec.md"
  echo "  [+] specs/0001-${FIRST_SPEC_NAME}/plan.md"
  echo "  [+] specs/0001-${FIRST_SPEC_NAME}/tasks.md"
fi
echo ""
echo "项目槽位将填入："
echo "    项目名:       $PROJECT_NAME"
echo "    项目类型:     $PROJECT_TYPE"
echo "    技术栈:       $PRIMARY_STACK"
echo "    验证命令:     $VERIFY_COMMANDS"
echo "    回滚方式:     $ROLLBACK"
echo "    关键路径:     $CRITICAL_PATHS"
echo "    接入级别:     L$LEVEL"
echo "    多线程协作:   $MULTI_THREAD"
if [[ "$USE_SDD" == "y" ]]; then
  echo "  Constitution 字段："
  echo "    原则 1:       ${PRINCIPLE_1_NAME:-(留占位符)}"
  echo "    原则 2:       ${PRINCIPLE_2_NAME:-(留占位符)}"
  echo "    原则 3:       ${PRINCIPLE_3_NAME:-(留占位符)}"
  echo "    不可妥协 1:   ${NON_NEGOTIABLE_1:-(留占位符)}"
  echo "    不可妥协 2:   ${NON_NEGOTIABLE_2:-(留占位符)}"
  echo "    不可妥协 3:   ${NON_NEGOTIABLE_3:-(留占位符)}"
  echo "    覆盖率门槛:   ${TEST_COVERAGE}%"
fi
echo ""

if [[ -z "$CONFIG_FILE" ]]; then
  CONFIRM=$(ask_yes_no "确认执行？" "Y")
  [[ "$CONFIRM" != "y" ]] && { echo "已取消"; exit 0; }
  echo ""
fi

# ---------- 写文件 ----------
TODAY=$(date +%Y-%m-%d)

# CLAUDE.md
if check_conflict "$TARGET_DIR/CLAUDE.md"; then
  if [[ "$DRY_RUN" == "y" ]]; then
    echo "[dry] would create $TARGET_DIR/CLAUDE.md (with all slots filled)"
  else
    cp "$SCRIPT_DIR/CLAUDE.md.template" "$TARGET_DIR/CLAUDE.md"
    replace_in_file "$TARGET_DIR/CLAUDE.md" "PROJECT_NAME" "$PROJECT_NAME"
    replace_in_file "$TARGET_DIR/CLAUDE.md" "PROJECT_TYPE" "$PROJECT_TYPE"
    replace_in_file "$TARGET_DIR/CLAUDE.md" "PRIMARY_STACK" "$PRIMARY_STACK"
    replace_in_file "$TARGET_DIR/CLAUDE.md" "VERIFY_COMMANDS" "$VERIFY_COMMANDS"
    replace_in_file "$TARGET_DIR/CLAUDE.md" "ROLLBACK" "$ROLLBACK"
    replace_in_file "$TARGET_DIR/CLAUDE.md" "CRITICAL_PATHS" "$CRITICAL_PATHS"
    replace_line_in_file "$TARGET_DIR/CLAUDE.md" "^- 接入级别：" "- 接入级别：L$LEVEL"
    replace_line_in_file "$TARGET_DIR/CLAUDE.md" "^- 多线程协作：" "- 多线程协作：$MULTI_THREAD"
    echo "[ok] CLAUDE.md"
  fi
fi

# constitution.md
if [[ "$USE_SDD" == "y" ]]; then
  if check_conflict "$TARGET_DIR/constitution.md"; then
    if [[ "$DRY_RUN" == "y" ]]; then
      echo "[dry] would create $TARGET_DIR/constitution.md"
    else
      cp "$SCRIPT_DIR/spec-kit/constitution.md.template" "$TARGET_DIR/constitution.md"
      replace_in_file "$TARGET_DIR/constitution.md" "PROJECT_NAME" "$PROJECT_NAME"
      replace_in_file "$TARGET_DIR/constitution.md" "YYYY-MM-DD" "$TODAY"
      replace_in_file "$TARGET_DIR/constitution.md" "PRIMARY_STACK" "$PRIMARY_STACK"
      replace_in_file "$TARGET_DIR/constitution.md" "TEST_COVERAGE" "$TEST_COVERAGE"
      # 选填字段：填了才替换，没填保留占位符
      [[ -n "$PRINCIPLE_1_NAME" ]] && replace_in_file "$TARGET_DIR/constitution.md" "PRINCIPLE_1_NAME" "$PRINCIPLE_1_NAME"
      [[ -n "$PRINCIPLE_2_NAME" ]] && replace_in_file "$TARGET_DIR/constitution.md" "PRINCIPLE_2_NAME" "$PRINCIPLE_2_NAME"
      [[ -n "$PRINCIPLE_3_NAME" ]] && replace_in_file "$TARGET_DIR/constitution.md" "PRINCIPLE_3_NAME" "$PRINCIPLE_3_NAME"
      [[ -n "$NON_NEGOTIABLE_1" ]] && replace_in_file "$TARGET_DIR/constitution.md" "NON_NEGOTIABLE_1" "$NON_NEGOTIABLE_1"
      [[ -n "$NON_NEGOTIABLE_2" ]] && replace_in_file "$TARGET_DIR/constitution.md" "NON_NEGOTIABLE_2" "$NON_NEGOTIABLE_2"
      [[ -n "$NON_NEGOTIABLE_3" ]] && replace_in_file "$TARGET_DIR/constitution.md" "NON_NEGOTIABLE_3" "$NON_NEGOTIABLE_3"
      echo "[ok] constitution.md"
    fi
  fi
fi

# 第一个 feature
if [[ "$CREATE_FIRST_SPEC" == "y" ]]; then
  FEATURE_DIR="$TARGET_DIR/specs/0001-${FIRST_SPEC_NAME}"
  if [[ "$DRY_RUN" == "y" ]]; then
    echo "[dry] would mkdir -p $FEATURE_DIR"
    echo "[dry] would create specs/0001-${FIRST_SPEC_NAME}/{spec,plan,tasks}.md"
  else
    mkdir -p "$FEATURE_DIR"
    for kind in spec plan tasks; do
      src="$SCRIPT_DIR/spec-kit/templates/${kind}.md.template"
      dst="$FEATURE_DIR/${kind}.md"
      if check_conflict "$dst"; then
        cp "$src" "$dst"
        replace_in_file "$dst" "Feature Name" "$FIRST_SPEC_NAME"
        echo "[ok] specs/0001-${FIRST_SPEC_NAME}/${kind}.md"
      fi
    done
  fi
fi

# ---------- 结果校验 ----------
if [[ "$DRY_RUN" != "y" ]]; then
  missing_files=()

  [[ -f "$TARGET_DIR/CLAUDE.md" ]] || missing_files+=("$TARGET_DIR/CLAUDE.md")

  if [[ "$USE_SDD" == "y" ]]; then
    [[ -f "$TARGET_DIR/constitution.md" ]] || missing_files+=("$TARGET_DIR/constitution.md")
  fi

  if [[ "$CREATE_FIRST_SPEC" == "y" ]]; then
    for kind in spec plan tasks; do
      path="$TARGET_DIR/specs/0001-${FIRST_SPEC_NAME}/${kind}.md"
      [[ -f "$path" ]] || missing_files+=("$path")
    done
  fi

  if [[ ${#missing_files[@]} -gt 0 ]]; then
    echo ""
    echo "ERROR: init.sh reported success but expected files are missing:" >&2
    printf '  - %s\n' "${missing_files[@]}" >&2
    echo "当前目标目录: $TARGET_DIR" >&2
    echo "请确认你是在仓库根目录运行：bash workflow-portable/init.sh" >&2
    exit 1
  fi
fi

# ---------- Next steps ----------
echo ""
echo "================================================"
[[ "$DRY_RUN" == "y" ]] && echo "  Dry run 结束（未写任何文件）" || echo "  完成"
echo "================================================"
echo ""

if [[ "$DRY_RUN" == "y" ]]; then
  echo "去掉 --dry-run 即可实际执行。"
  exit 0
fi

echo "Next steps:"
echo ""
echo "  1. 打开 CLAUDE.md，确认顶部槽位无 {{}} 残留"
if [[ "$USE_SDD" == "y" ]]; then
  echo "  2. 编辑 constitution.md，把残留的 {{...}} 占位符填掉："
  echo "       - I.   核心原则的描述 + 违反信号"
  echo "       - II.  其余不可妥协项"
  echo "       - III. 数据库 / 部署目标 / 依赖政策 / 数据契约"
  echo "       - IV.  代码规范 / 安全 / 性能数字"
fi
if [[ "$CREATE_FIRST_SPEC" != "y" && "$USE_SDD" == "y" ]]; then
  echo "  3. 创建第一个 feature:"
  echo "       mkdir -p specs/0001-<feature-name>"
  echo "       cp workflow-portable/spec-kit/templates/spec.md.template  specs/0001-<feature-name>/spec.md"
  echo "       cp workflow-portable/spec-kit/templates/plan.md.template  specs/0001-<feature-name>/plan.md"
  echo "       cp workflow-portable/spec-kit/templates/tasks.md.template specs/0001-<feature-name>/tasks.md"
elif [[ "$CREATE_FIRST_SPEC" == "y" ]]; then
  echo "  3. 编辑 specs/0001-${FIRST_SPEC_NAME}/spec.md，按 SDD 流程往下走"
fi
if [[ "$LEVEL" != "0" ]]; then
  echo ""
  echo "  L${LEVEL} 多线程：直接引用 workflow-portable/templates/ 下的模板"
fi
echo ""
echo "  详细流程："
echo "    workflow-portable/docs/adoption-guide.md      (协议接入)"
[[ "$USE_SDD" == "y" ]] && echo "    workflow-portable/spec-kit/docs/sdd-flow.md   (SDD 流程)"
echo ""
