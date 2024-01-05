pipeline {
    agent any
    options {
        skipStagesAfterUnstable()
    }
    environment {
        APP_FOLDER = "solefi-api"
        BRANCH = sh(script: "echo ${BRANCH}", , returnStdout: true).trim()
    }
    stages {
        stage("Check App folders") {
            steps {
                sh "mkdir /apps/$APP_FOLDER/db -p"
                sh "chmod -R 777 /apps/$APP_FOLDER/db"

                sh "mkdir /apps/$APP_FOLDER/static -p"
                sh "chmod -R 777 /apps/$APP_FOLDER/static"

                sh "mkdir /apps/$APP_FOLDER/media -p"
                sh "chmod -R 777 /apps/$APP_FOLDER/media"
            }
        }
        stage("Deploy and start instance") {
            steps {
                sh "cp /apps/$APP_FOLDER/env.default /apps/$APP_FOLDER/env"
                sh "echo BRANCH=$BRANCH >> /apps/$APP_FOLDER/env"
                sh "docker-compose --env-file /apps/$APP_FOLDER/env -f ./docker-compose.yaml pull"
                sh "docker-compose --env-file /apps/$APP_FOLDER/env -f ./docker-compose.yaml down --remove-orphans -f"
                sh "docker-compose --env-file /apps/$APP_FOLDER/env -f ./docker-compose.yaml up -d"
            }
        }
    }
}
