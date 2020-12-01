/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable no-console */
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import {
    LightningElement,
    track,
    api
} from 'lwc';
import {
    loadScript
} from 'lightning/platformResourceLoader';
import {
    ShowToastEvent
} from 'lightning/platformShowToastEvent';
import {
    readAsBinaryString
} from './readFile';
import SHEETJS_ZIP from '@salesforce/resourceUrl/sheetjs'

import createSolicitudFromExcel from '@salesforce/apex/excelManager.createSolicitudFromExcel'
import saveFileToSolicitud from '@salesforce/apex/excelManager.saveFileToSolicitud';

export default class ExcelUpload extends LightningElement {
    // Id of currently displayed record (component is only for display on record pages)
    @api recordId;
    @api objectApiName;

    // Title and Label displayed in UI
    @api title = 'Iniciar Nueva Solicitud';
    @api label;

    // Configuration of record fields and the corresponding Excel cell adresses
    // up to 10 fields are supported; fields may be left blank


    // state management to display spinners and the modal used while uploading the component
    @track ready = false;
    @track error = false;

    @track uploading = false;
    @track uploadStep = 0;
    @track uploadMessage = '';
    @track uploadDone = false;
    @track uploadError = false;
    @track parentRecord = '';
    @track fileData = '';

    value = 'prereferenciamiento';

    get options() {
        return [{
                label: 'Prereferenciamiento',
                value: 'prereferenciamiento'
            },
            {
                label: 'Smart Sheet',
                value: 'inProgress'
            }
        ];
    }

    handleChange(event) {
        this.value = event.detail.value;
    }

    get loading() {
        return !this.ready && !this.error;
    }

    renderedCallback() {
        loadScript(this, SHEETJS_ZIP + '/xlsx.full.min.js')
            .then(() => {
                if (!window.XLSX) {
                    throw new Error('Error loading SheetJS library (XLSX undefined)');
                }
                this.ready = true;
            })
            .catch(error => {
                this.error = error;
                console.log('Error: ' + error);
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Excel Upload: Error loading SheetJS',
                        message: error.message,
                        variant: 'error'
                    })
                );
            });
    }

    constructor() {
        super();


    }

    // The promise chain for upload a new file will
    // 1. read the file, 2. parse it and extract the Excel cells and 
    // update the record, 3. upload the file to the record as "attachment"
    // (ContentVersion to be more precise), and 4. shortly wait to display
    // the modal before letting it disappear
    uploadFile(evt) {
        const recordId = this.recordId;
        let file;

        Promise.resolve(evt.target.files)
            .then(files => {
                this.uploading = true;
                this.uploadStep = "1";
                this.uploadMessage = 'Reading File';
                this.uploadDone = false;
                this.uploadError = false;

                if (files.length !== 1) {
                    throw new Error("Error accessing file -- " +
                        (files.length === 0 ?
                            'No file received' :
                            'Multiple files received'
                        ));
                }

                file = files[0];
                return readAsBinaryString(file);
            })
            .then(blob => {
                this.uploadStep = "2";
                this.uploadMessage = 'Extracting Data';
                console.log('Extrayendo datos...');
                let workbook = window.XLSX.read(blob, {
                    type: 'binary'
                });

                if (!workbook || !workbook.Workbook) {
                    throw new Error("Cannot read Excel File (incorrect file format?)");
                }
                console.log('Numero de Sheets: ' + workbook.SheetNames.length);
                if (workbook.SheetNames.length < 1) {
                    throw new Error("Excel file does not contain any sheets");
                }


                //Leyendo todo el contenido

                let sheet = workbook.Sheets[workbook.SheetNames[0]];
                let contenido = XLSX.utils.sheet_to_json(sheet, {
                    header: 1,
                    blankrows: false
                });
                console.log('Contenido: ' + JSON.stringify(contenido));
                
                this.uploadStep = "3";
                this.uploadMessage = 'Updating Record';

                return createSolicitudFromExcel({
                    data: JSON.stringify(contenido)
                })
                //.then(() => blob);
                .then(result => {
                    this.parentRecord = result.Id;
                    console.log("PARENT: " + JSON.stringify(this.parentRecord));
                })
                /*  return updateRecord({
                      fields: record
                  }).then(() => blob);*/
            })
            .then(blob => {
                this.uploadStep = "4";
                this.uploadMessage = 'Uploading File';

                console.log("File: " + JSON.stringify(file.name));
                console.log("Parent Record: " + JSON.stringify(this.parentRecord));
                console.log("Blob: " + JSON.stringify(readAsBinaryString(file)));

                return saveFileToSolicitud ({
                    parentId : this.parentRecord, 
                    fileName : file.name,
                    base64Data : window.btoa(readAsBinaryString(file))
                })

               /* const cv = {
                    Title: file.name,
                    PathOnClient: file.name,
                    VersionData: window.btoa(blob),
                    FirstPublishLocationId: this.recordId
                };
                return createRecord({
                     apiName: "ContentVersion",
                     fields: cv
                 })*/
            })
            .then(_cv => {
                // Unfortunately, the last step won't get a check mark -- 
                // the base component <lightning-progress-indicator> is missing this functionality        
                this.uploadMessage = "Done";
                this.uploadDone = true;
                return new Promise(function (resolve, _reject) {
                    // eslint-disable-next-line @lwc/lwc/no-async-operation
                    window.setTimeout(resolve, 1000);
                });
            })
            .then(() => {
                this.closeModal();

                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Excel Upload: Success',
                        message: 'Current record has been updated successfully and the Excel file uploaded',
                        variant: 'success'
                    })
                );
            })
            .catch(err => {
                this.uploadError = true;
                this.uploadMessage = "Error: " + err.message;
            });
    }

    closeModal() {
        this.uploading = false;
        this.uploadStep = 0;
        this.uploadMessage = '';
        this.uploadDone = false;
        this.uploadError = false;
    }
}