<?php
/*! Copyright Social CRM Hub and other contributors. Licensed under MIT *//*
    https://github.com/SCRMHub/AWS-S3-Multipart-JS-Uploader/LICENSE
*/
/**
 * Server Upload Class
 * @author Gregory Brine <greg.brine@scrmhub.com>
 */
namespace SCRMHub\AWS;

use Aws\Common\Enum\DateFormat;
use Aws\S3\Model\MultipartUpload\UploadId;
use Aws\S3\S3Client;
use Exception;

class Uploader {
    private $client;
    private $bucket;
    private $folderpath;

    function __construct($client, $bucket, $folder = '/') {
        $this->client       = $client;
        $this->bucket       = $bucket;
        $this->folderpath   = $folder;
    }

    function run() {
        //Get the action
        $action = isset($_GET['action']) ? strtolower($_GET['action']) : '';

        try {
            //Run it
            switch ($action) {
                case 'multipartstart':
                    $result = $this->multipartStartAction();
                    break;
                case 'multipartsignpart':
                    $result = $this->multipartSignPartAction();
                    break;
                case 'multipartcomplete':
                    $result = $this->multipartCompleteAction();
                    break;
                case 'multipartabort':
                    $result = $this->multipartAbortAction();
                    break;
                default:
                    $result = ['error' => 'Action not found'];
            }
        } catch(Exception $e) {
            $result = [
                'error' => $e->getMessage()
            ];
        }

        $this->sendResult($result);
    }   


    function multipartStartAction() {
        $bits       = explode('.', $_REQUEST['fileInfo']['name']);
        $extension  = array_pop($bits);
        $filename   = md5(uniqid('', true)) . '.' . $extension;

        //Make the upload model details
        $model = $this->client->createMultipartUpload(array(
            'Bucket'        => $this->bucket,
            'Key'           => $filename,
            'ContentType'   => $_REQUEST['fileInfo']['type'],
            'Metadata'      => $_REQUEST['fileInfo'],
            'Body'          => ''
        ));

        return array(
            'uploadId'  => $model->get('UploadId'),
            'key'       => $model->get('Key'),
        );
    }

    function multipartSignPartAction() {
        $command = $this->client->getCommand('UploadPart',
            array(
                'Bucket'        => $this->bucket,
                'Key'           => $_REQUEST['sendBackData']['key'],
                'UploadId'      => $_REQUEST['sendBackData']['uploadId'],
                'PartNumber'    => $_REQUEST['partNumber'],
                'ContentLength' => $_REQUEST['contentLength']
            )
        );

        $request = $command->prepare();
        // This dispatch commands wasted a lot of my times :'(
        $this->client->dispatch('command.before_send', array('command' => $command));
        $request->removeHeader('User-Agent');
        $amzDate = gmdate(DateFormat::RFC2822);
        $request->setHeader('x-amz-date', $amzDate);
        // This dispatch commands wasted a lot of my times :'(
        $this->client->dispatch('request.before_send', array('request' => $request));

        return [
            'url'           => $request->getUrl(),
            'authHeader'    => (string) $request->getHeader('Authorization'),
            'dateHeader'    => (string) $amzDate
        ];
    }


    private function multipartCompleteAction() {
        $partsModel = $this->client->listParts(array(
            'Bucket'    => $this->bucket,
            'Key'       => $_REQUEST['sendBackData']['key'],
            'UploadId'  => $_REQUEST['sendBackData']['uploadId'],
        ));

        $model = $this->client->completeMultipartUpload(array(
            'Bucket'    => $this->bucket,
            'Key'       => $_REQUEST['sendBackData']['key'],
            'UploadId'  => $_REQUEST['sendBackData']['uploadId'],
            'Parts'     => $partsModel['Parts'],
        ));

        return [
            'url' => $_REQUEST['sendBackData']['key']
        ];
    }

    private function multipartAbortAction() {
        $model = $this->client->abortMultipartUpload(array(
            'Bucket'        => $this->bucket,
            'Key'           => $_REQUEST['sendBackData']['key'],
            'UploadId'      => $_REQUEST['sendBackData']['uploadId']
        ));

        return [
            'success' => true
        ];
    }

    private function sendResult(array $result) {
        $response = [
            'result' => $result
        ];

        if(!$result) {
            $code = 500;
            $response['ok'] = false;
        } elseif(isset($result['error'])) {
            $code = 500;
            $response = $result;
            $response['ok'] = false;
        } else {
            $code = 200;
            $response['ok'] = true;
        }

        http_response_code($code);
        header('Content-Type: application/json');
        die(json_encode($response));
    }
}
