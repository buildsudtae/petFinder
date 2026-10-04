// Jenkins → SSH เข้า course container (tuchsanai/devtools:2569_1) → สั่ง docker ในนั้น
// pattern เดียวกับ LAB 003_Docker_Build_Push / 004_Webhook_Trigger: Jenkins ไม่ build เอง
// ต้องมี credential 2 ตัวใน Jenkins: devtools-ssh (SSH key) และ dockerhub (username + token)
// หลักการ: stage ถัดไปรันเมื่อ stage ก่อนหน้าผ่านเท่านั้น — Test แดง = ไม่ Push ไม่ Deploy
pipeline {
  agent any

  triggers { githubPush() }

  options {
    disableConcurrentBuilds()
    skipDefaultCheckout()
  }

  environment {
    SSH_DEVTOOLS = 'ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes root@devtools'
    SRC_DIR      = '/workspace/pettech'
    AUTH_DIR     = '/root/pettech-auth'
    IMAGE_TAG    = "build-${env.BUILD_NUMBER}"
  }

  stages {
    stage('Connect') {
      steps {
        sshagent(credentials: ['devtools-ssh']) {
          sh '$SSH_DEVTOOLS "hostname && docker --version && docker compose version"'
        }
      }
    }

    stage('Secrets') {
      steps {
        script {
          def scmVars = checkout scm
          env.COMMIT = scmVars.GIT_COMMIT.substring(0, 7)
        }
        // .env ที่ถูก track = secret รั่ว หยุดการส่งมอบทันที (repo นี้คือ root ของโปรเจกต์ ไม่มี prefix pettech/)
        sh '''
          if git ls-files --error-unmatch .env >/dev/null 2>&1; then
            echo "พบ .env ถูก track ใน git — หยุด pipeline"; exit 1
          fi
          test -f .env.example
          '''
      }
    }

    stage('Ship source') {
      steps {
        sshagent(credentials: ['devtools-ssh']) {
          sh '''
            $SSH_DEVTOOLS "rm -rf $SRC_DIR && mkdir -p $SRC_DIR"
            tar --exclude=.git --exclude=node_modules -cf - . | $SSH_DEVTOOLS "tar -xf - -C $SRC_DIR"
            $SSH_DEVTOOLS "test -f $SRC_DIR/infra/docker-compose.yml"
            '''.stripIndent()
        }
      }
    }

    stage('Build') {
      steps {
        sshagent(credentials: ['devtools-ssh']) {
          sh '''
            $SSH_DEVTOOLS "SRC_DIR=$SRC_DIR IMAGE_TAG=$IMAGE_TAG COMMIT=$COMMIT BUILD_NUMBER=$BUILD_NUMBER bash -ex" <<'EOF'
              cd "$SRC_DIR"
              cp .env.example .env
              export APP_VERSION=0.1.0 GIT_COMMIT="$COMMIT" BUILD_NUMBER="$BUILD_NUMBER" IMAGE_TAG="$IMAGE_TAG"
              # worker image คือ FROM pettech-api — build api ก่อน (เหมือน scripts/up.sh) ไม่ให้ compose วิ่งไป pull
              docker compose --env-file .env -f infra/docker-compose.yml build api
              docker compose --env-file .env -f infra/docker-compose.yml build
            EOF
            '''.stripIndent()
        }
      }
    }

    stage('Test') {
      steps {
        sshagent(credentials: ['devtools-ssh']) {
          sh '''
            $SSH_DEVTOOLS "SRC_DIR=$SRC_DIR bash -ex" <<'EOF'
              cd "$SRC_DIR"
              ./scripts/test.sh </dev/null
            EOF
            '''.stripIndent()
        }
      }
    }

    stage('Push') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub',
                         usernameVariable: 'HUB_USER', passwordVariable: 'HUB_TOKEN')]) {
          sshagent(credentials: ['devtools-ssh']) {
            sh '''
              set +x
              echo "$HUB_TOKEN" | $SSH_DEVTOOLS "umask 077; mkdir -p $AUTH_DIR; docker --config $AUTH_DIR login -u $HUB_USER --password-stdin"
              set -x
              for svc in api web; do
                $SSH_DEVTOOLS "docker tag pettech-$svc:$IMAGE_TAG $HUB_USER/pettech-$svc:$IMAGE_TAG"
                $SSH_DEVTOOLS "docker --config $AUTH_DIR push $HUB_USER/pettech-$svc:$IMAGE_TAG"
              done
              '''.stripIndent()
          }
        }
      }
    }

    stage('Deploy') {
      steps {
        sshagent(credentials: ['devtools-ssh']) {
          sh '''
            $SSH_DEVTOOLS "SRC_DIR=$SRC_DIR IMAGE_TAG=$IMAGE_TAG COMMIT=$COMMIT BUILD_NUMBER=$BUILD_NUMBER bash -ex" <<'EOF'
              cd "$SRC_DIR"
              export APP_VERSION=0.1.0 GIT_COMMIT="$COMMIT" BUILD_NUMBER="$BUILD_NUMBER" IMAGE_TAG="$IMAGE_TAG"
              docker compose --env-file .env -f infra/docker-compose.yml up -d
              # ตรวจ "status":"ok" ไม่ใช่แค่ HTTP 200: ก่อน api ลงทะเบียนกับ Traefik, /api/health ตกไปที่ web ซึ่งตอบ 200 เป็น HTML
              # </dev/null: ไม่ให้ docker exec กลืน stdin ซึ่งเป็นตัวสคริปต์ที่เหลือ
              docker compose -f infra/docker-compose.yml exec -T api alembic upgrade head </dev/null
              ok=0
              for i in $(seq 1 30); do
                if curl -fsS http://localhost:8000/api/health | grep -q '"status":"ok"'; then ok=1; break; fi
                sleep 2
              done
              [ "$ok" = 1 ] || { echo "ระบบไม่ขึ้นภายใน 60 วินาที"; exit 1; }
            EOF
            '''.stripIndent()
        }
      }
    }

    stage('Verify') {
      steps {
        sshagent(credentials: ['devtools-ssh']) {
          sh '''
            $SSH_DEVTOOLS "SRC_DIR=$SRC_DIR COMMIT=$COMMIT bash -ex" <<'EOF'
              cd "$SRC_DIR"
              # สิ่งที่ deploy ต้องเป็น commit เดียวกับที่เพิ่งผ่านเทสต์
              curl -fsS http://localhost:8000/api/health | grep -F "\\"commit\\":\\"$COMMIT\\""
              ./scripts/smoke.sh </dev/null
              ./scripts/race.sh </dev/null
            EOF
            '''.stripIndent()
        }
      }
    }
  }

  post {
    always {
      sshagent(credentials: ['devtools-ssh']) {
        sh '$SSH_DEVTOOLS "rm -rf $AUTH_DIR" || true'
      }
    }
    failure {
      echo 'pipeline แดง — ไม่ deploy เวอร์ชันนี้ ดู stage ที่แดงและแก้ก่อน push ใหม่'
    }
  }
}
