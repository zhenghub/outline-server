# 运行已有的manager

export ROOT_DIR=${ROOT_DIR:-$(git rev-parse --show-toplevel)}
export BUILD_DIR=${BUILD_DIR:-$ROOT_DIR/build}
export _DO_ACTION_INDENT=''

readonly NODE_MODULES_BIN_DIR=$ROOT_DIR/src/server_manager/node_modules/.bin

cd $BUILD_DIR/server_manager/electron_app/static
OUTLINE_DEBUG=true \
SB_METRICS_URL=https://metrics-test.uproxy.org \
SENTRY_DSN=https://ee9db4eb185b471ca08c8eb5efbf61f1@sentry.io/214597 \
$NODE_MODULES_BIN_DIR/electron .