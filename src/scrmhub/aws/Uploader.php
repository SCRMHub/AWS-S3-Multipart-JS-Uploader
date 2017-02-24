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

/**
 * SCRM HUB AWS Example upload code
 */
class Uploader {
    private $client;
    private $bucket;
    private $folderpath;

    /**
     * Setup the class options
     * @param \Aws\S3\S3Client  $client     The AWS Client
     * @param string            $bucket     The AWS Bucket to upload to
     * @param string            $folder     The folder path
     */
    function __construct($client, $bucket, $folder = '/') {
        $this->client       = $client;
        $this->bucket       = $bucket;
        $this->folderpath   = $folder;
    }

    /**
     * The public hook 
     * @return array    The response for the front end
     */
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

    /**
     * This will create the signature call to start the upload
     * @return string   The URL to call next 
     */
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

    /**
     * This will create the signature for a file chunk
     * @return string   The URL to call next 
     */
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

    /**
     * Completing the upload
     * This call will stitch the file chunks together
     * @return string   The URL to call next 
     */
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

    /**
     * Abort an upload
     * This will clean up the files on the AWS Bucket
     * @return string   The URL to call next 
     */
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

    /**
     * Simple Output class
     * @param  array  $result The result to return to the browser
     */
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
        exit(json_encode($response));
    }
}
